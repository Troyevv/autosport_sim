#include "dynamics.hpp"
#include <algorithm>
#include <cmath>
#include <numbers>

namespace race {
namespace {
double square(double x) { return x * x; }
constexpr double radians_per_rpm = std::numbers::pi / 30;
double surface_factor(Surface material) {
    switch (material) {
    case Surface::asphalt:
        return 1.;
    case Surface::kerb:
        return .88;
    case Surface::runoff:
        return .70;
    default:
        return .43;
    }
}
void heat_tyre(Tyre &t, const Spec &p, const Conditions &env, const Wheel &wheel, double speed,
               double roughness, double h) {
    const double work = wheel.slip_power;
    const double capacity = std::max(1500., 250. * p.warmup_kj / (p.high_c - p.low_c));
    const double conduction = capacity * .07 * (t.surface - t.core);
    const double convection =
        capacity * (.00075 + .000025 * speed + .0015 * env.water_mm) * (t.surface - env.ambient);
    const double contact = capacity * .0019 * (t.surface - env.track_c);
    // Infrared loss from the exposed tread/sidewall, approximated as a black
    // rubber cylinder (emissivity 0.92). This increases strongly on a hot tyre.
    double area = 2 * std::numbers::pi * p.radius * (p.width * .14 + p.radius * .45);
    double radiation = .92 * 5.670374419e-8 * area *
                       (square(square(t.surface + 273.15)) - square(square(env.ambient + 273.15)));
    t.surface += h * (work - conduction - convection - contact - radiation) / (capacity * .32);
    t.core += h * (conduction - capacity * .00065 * (t.core - env.ambient)) / (capacity * .68);
    double cold = std::max(0., (p.low_c - t.surface) / 35.);
    double hot = std::max(0., (t.surface - p.high_c) / 30.);
    const double duty = std::clamp(work / std::max(250., wheel.load * 1.4), 0., 8.);
    double abrasion = (.48 + .52 * duty) * (1 + 25 * roughness) * (1 + hot + t.flat);
    t.wear = std::min(1., t.wear + h * speed * p.wear_rate * p.compound_wear * abrasion /
                                       (100000 * p.tread_mm));
    t.grain = std::clamp(t.grain + h * (cold * duty * .0008 - (cold == 0 ? .0004 : 0)), 0., 1.);
    t.blister = std::min(1., t.blister + h * hot * duty * .0006);
    t.degradation = std::min(1., t.degradation + h * square(hot) * .00045);
    t.flat = std::min(1., t.flat + h * wheel.lock * speed * .0009);
    if (t.core >= p.low_c && !t.hot) {
        t.hot = true;
        ++t.cycles;
    }
    if (t.core < p.low_c - 18)
        t.hot = false;
    t.punctured = t.punctured || t.wear >= 1 || t.flat >= .98 || t.blister >= .98;
}
} // namespace
Forces aerodynamics(const Spec &p, double v, double wake, bool drs, double roughness) {
    const double q = .5 * air_density * v * v;
    const double wing = p.wing_area * p.wing * (drs ? .77 : 1.);
    const double free_load = q * (p.front_area + wing + p.floor_area);
    const double compression = free_load * (1 / (p.spring_rate * p.spring) + 1 / p.tyre_rate);
    const double travel = std::max(1., p.static_mm + p.ride_mm - .54 * p.design_mm);
    const double clearance = p.static_mm + p.ride_mm - travel * std::tanh(compression / travel);
    const double floor =
        p.floor_area * std::clamp(1 - std::abs(clearance - p.design_mm) / p.design_mm, 0., 1.);
    const double front_load = q * p.front_area * (1 - .35 * wake);
    const double wing_load = q * wing * (1 - .21 * wake);
    const double floor_load = q * floor * (1 - .42 * wake) / (1 + roughness * 2 * p.spring);
    const double drag_area =
        p.base_drag + .55 * p.inlet * p.cooling + p.wing_drag * square(p.wing) * (drs ? .60 : 1.);
    return {q * drag_area * (1 - .31 * wake), front_load + wing_load + floor_load,
            (front_load + wing_load * .18 + floor_load * .62) /
                std::max(1., front_load + wing_load + floor_load),
            1 - .33 * wake};
}
double pressure_kpa(const Spec &p, const Tyre &t, size_t corner) {
    return t.punctured ? 20.
                       : (p.cold_kpa[corner] + 101.325) * (t.core + 273.15) / 293.15 - 101.325;
}
double tyre_mu(const Spec &p, const Tyre &t, double load, double pressure, double water,
               double speed) {
    double outside = std::max({0., p.low_c - t.surface, t.surface - p.high_c});
    double thermal = std::max(.46, 1 - .00017 * square(outside));
    const double rated_hot = (p.kart ? 95. : 145.) + ((p.kart ? 95. : 145.) + 101.325) *
                                                         ((p.low_c + p.high_c) * .5 - 20) / 293.15;
    double inflation = std::max(.68, 1 - .000040 * square(pressure - rated_hot));
    double ageing = 1 - .20 * t.wear - .25 * t.wear * t.wear * t.wear - .16 * t.degradation -
                    .13 * t.grain - .16 * t.blister - .13 * t.flat - .006 * std::min(t.cycles, 8);
    const double load_sensitivity =
        std::clamp(1 - .10 * (load / (p.max_load * .45) - 1), .67, 1.09);
    // mm depth * m tread width * m/s gives litres/s at one wheel.
    double swept = water * (p.width * .14) * speed;
    double drainage = p.water_flow * p.compound_drain * (1 - .75 * t.wear);
    double wet = 1 / (1 + .22 * water + .65 * swept / (drainage + 1.));
    return p.mu * p.compound_grip * thermal * inflation * std::max(.35, ageing) * load_sensitivity *
           std::max(.23, wet) * (t.punctured ? .22 : 1.);
}
void integrate(const Track &track, Vehicle &car, const Conditions &env, double wake, bool drs,
               Control input, double h) {
    auto &s = car.state;
    const auto &p = car.spec;
    auto &r = car.reading;
    r = {};
    const auto &road = track.ribbon(Road::circuit);
    const auto &frame = car.frame;
    const double v = s.v, mass = p.dry_mass + p.driver_mass + s.fuel;
    if (input.reverse != s.reversing) {
        if (v < .10)
            s.reversing = input.reverse;
        else {
            input.throttle = 0;
            input.brake = std::max(.35, input.brake);
            input.push = false;
        }
    }
    if (s.reversing) {
        s.gear = 1;
        input.deploy = 0;
        if (v > 2 || p.kart)
            input.throttle = 0;
    }
    const double direction = s.reversing ? -1. : 1.;
    const double normal_g =
        gravity / std::sqrt(1 + square(frame.grade) + square(frame.section.crossfall));
    auto aero = aerodynamics(p, v, wake, drs, frame.section.roughness);
    // Fuel cell sits just behind the nominal CG.
    const double front_share = p.front_weight - .10 * s.fuel / mass;
    const double cg = p.cg_height * (1 - .16 * s.fuel / mass);
    const double front = std::clamp(mass * normal_g * front_share - mass * s.ax * cg / p.wheelbase +
                                        aero.lift * aero.front_fraction,
                                    .05 * mass * normal_g, .95 * (mass * normal_g + aero.lift));
    const double rear = mass * normal_g + aero.lift - front;
    const double lateral_transfer = mass * s.ay * cg / (p.width * .83);
    const double k = std::tan(input.steer) / p.wheelbase;
    const double slip_correction = -s.lateral_v / .32;
    const double lateral_request =
        mass * (v * v * k + normal_g * frame.section.crossfall + slip_correction);
    double rpm = v / p.radius * car.ratios[s.gear - 1] / radians_per_rpm;
    s.shift_left = std::max(0., s.shift_left - h);
    if (!s.shift_left && !p.kart && !s.reversing) {
        int gear = s.gear;
        if (input.gear > 0) {
            int requested =
                std::clamp(input.gear, std::max(1, gear - 1), std::min(p.gears, gear + 1));
            if (requested > gear ||
                rpm * car.ratios[requested - 1] / car.ratios[gear - 1] <= p.redline)
                gear = requested;
        } else if (rpm > .95 * p.redline && gear < p.gears)
            ++gear;
        else if (gear > 1 && rpm * car.ratios[gear - 2] / car.ratios[gear - 1] < .86 * p.redline)
            --gear;
        if (gear != s.gear) {
            s.gear = gear;
            s.shift_left = p.shift_s;
            r.shift = 1;
            rpm = v / p.radius * car.ratios[gear - 1] / radians_per_rpm;
        }
    }
    // Launch clutch for cars; direct drive karts require a rolling start.
    rpm = p.kart ? rpm : std::max(rpm, .37 * p.redline);
    if (!input.ignition) {
        rpm = 0;
        input.deploy = 0;
        input.clutch = 0;
    }
    const double omega = std::max(1., rpm * radians_per_rpm);
    const double torque_shape = std::clamp(1 - .95 * square(rpm / p.redline - .67), .15, 1.);
    double throttle = (s.shift_left > 0 || rpm > p.redline || s.fuel <= 0 || (p.kart && rpm < 600))
                          ? 0
                          : input.throttle;
    const double derate = std::clamp(1 - (s.coolant - 110) * .021, .30, 1.);
    const double rated_ice = std::max(0., p.power_kw - (p.lap_deploy_kj > 0 ? p.motor_kw : 0.));
    const double ice = std::min({rated_ice * derate, p.torque_nm * torque_shape * omega / 1000.,
                                 s.fuel * 3600000. / (p.bsfc * h)});
    double motor = (v >= p.deploy_floor) ? std::min(p.motor_kw * input.deploy, s.energy / h) : 0;
    if (p.lap_deploy_kj > 0)
        motor = std::min(motor, std::max(0., p.lap_deploy_kj - s.used_kj) / h);
    motor = std::min(motor, p.power_kw);
    const double shaft_kw =
        input.clutch * throttle *
        std::min({p.power_kw, ice + motor,
                  std::min(p.input_nm, p.torque_nm * torque_shape) * omega / 1000.});
    const double drive = 1000 * shaft_kw / omega * car.ratios[s.gear - 1] * p.efficiency / p.radius;
    const double motor_fraction = shaft_kw > 0 ? std::min(1., throttle * motor / shaft_kw) : 0.;
    const bool front_motor = p.deploy_floor > 0;
    double lateral_scale = 0;
    double sum_x = 0, sum_y = 0, applied_drive = 0, applied_motor = 0, regen_brake = 0;
    auto front_section = road.frame(s.cursor.s + (1 - p.front_weight) * p.wheelbase).section;
    auto rear_section = road.frame(s.cursor.s - p.front_weight * p.wheelbase).section;
    for (int i = 0; i < 4; ++i) {
        bool f = i < 2, left = i % 2 == 0;
        double axle = f ? front : rear;
        double transfer = std::clamp(lateral_transfer * (f ? p.antiroll : 1 - p.antiroll),
                                     -.48 * axle, .48 * axle);
        auto &w = r.wheels[i];
        w.load = axle * .5 + (left ? -1 : 1) * transfer;
        w.pressure = pressure_kpa(p, s.tyres[i], i);
        auto material =
            (f ? front_section : rear_section).surface(s.d + (left ? 1 : -1) * p.width * .41);
        w.mu =
            tyre_mu(p, s.tyres[i], w.load, w.pressure, env.water_mm, v) * surface_factor(material);
        const double capacity = std::max(1., w.mu * w.load);
    }
    for (int i = 0; i < 4; ++i) {
        bool f = i < 2;
        double axle = f ? front : rear;
        auto &w = r.wheels[i];
        double capacity = std::max(1., w.mu * w.load);
        double split = std::lerp(.5, w.load / axle, p.differential);
        double motor_w = (f == front_motor) ? drive * motor_fraction * split : 0.;
        double drive_w = motor_w + (f ? 0 : drive * (1 - motor_fraction) * split);
        double brake_w = input.brake * p.brake_nm / p.radius * (f ? p.bias : 1 - p.bias) * .5;
        double request_x = drive_w - brake_w;
        if (drive_w > capacity && drive_w > brake_w)
            r.wheelspin = std::max(r.wheelspin, 1 - capacity / drive_w);
        const double request_y =
            lateral_request * (f ? front_share : 1 - front_share) * w.load / axle;
        const double utilisation = std::hypot(request_x, request_y) / capacity;
        double scale = 1 / std::max(1., utilisation);
        w.lock = (v > 1 && brake_w > drive_w && !p.abs)
                     ? std::clamp((brake_w - drive_w) / capacity - 1, 0., 1.)
                     : 0.;
        scale *= 1 - .18 * w.lock;
        w.fx = request_x * scale;
        w.fy = request_y * scale;
        lateral_scale += (f ? front_share : 1 - front_share) * w.load / axle * scale;
        applied_drive += drive_w * scale;
        applied_motor += motor_w * scale;
        if (f == front_motor)
            regen_brake += brake_w * scale;
        // A locked differential forces a wheel-speed mismatch when turning.
        // The scrub force dissipates work and reduces available rear grip.
        double scrub =
            f ? 0. : w.load * .32 * p.differential * std::min(.25, std::abs(k) * p.width * .5);
        w.fx = std::clamp(w.fx - scrub, -std::sqrt(std::max(0., capacity * capacity - w.fy * w.fy)),
                          capacity);
        w.slip_power =
            v * (scrub) + v * (.012 * w.load + .043 * std::abs(w.fy) +
                               (.018 + .010 * std::min(utilisation, 2.)) * std::abs(w.fx) +
                               w.lock * brake_w * .55);
        heat_tyre(s.tyres[i], p, env, w, v, frame.section.roughness, h);
        sum_x += w.fx;
        sum_y += w.fy;
    }
    const double delivered = drive > 0 ? shaft_kw * applied_drive / drive : 0;
    const double deployed = drive > 0 ? shaft_kw * applied_motor / drive : 0.;
    const double combustion = delivered - deployed;
    double regen = std::min({p.motor_kw, regen_brake * v * .00072, .0005 * mass * v * v / h,
                             (p.battery_kj - s.energy) / h});
    if (p.lap_regen_kj > 0)
        regen = std::min(regen, std::max(0., p.lap_regen_kj - s.recovered_kj) / h);
    s.energy = std::clamp(s.energy + h * (regen - deployed), 0., p.battery_kj);
    s.used_kj += h * deployed;
    s.recovered_kj += h * regen;
    s.fuel = std::max(0., s.fuel - h * combustion * p.bsfc / 3600000.);
    double duty = combustion / std::max(1., rated_ice);
    double heat = p.heat_kw * duty + p.gear_heat * (delivered / p.power_kw);
    double rejection = p.radiator_kw * std::min(1., p.inlet * p.cooling / p.radiator_inlet) *
                       std::clamp(.12 + v / 42., .12, 1.22) * aero.airflow *
                       std::max(0., s.coolant - env.ambient) / 70.;
    rejection *= std::clamp((s.coolant - 76.) / 12., .03, 1.);
    s.coolant += h * (heat - rejection) / std::max(12., p.flow_kg_s * 65.);
    double rolling = mass * normal_g *
                     (.013 + frame.section.roughness * .4 +
                      (frame.section.surface(s.d) == Surface::outside ? .075 : 0));
    // Push-start a direct-drive kart. The driver's feet supply a bounded
    // external force and work only up to jogging speed, with the brake released.
    if (p.kart && input.push && v < 2.4 && input.brake < .02 && s.fuel > 0)
        r.push_force = std::min(.36 * p.driver_mass * gravity, 240. / std::max(.4, v));
    sum_x += r.push_force;
    r.clutch = input.clutch;
    double ax = (sum_x - aero.drag - rolling) / mass - direction * normal_g * frame.grade;
    s.v = std::max(0., v + h * ax);
    s.ax = (s.v - v) / h;
    s.ay = sum_y / mass - normal_g * frame.section.crossfall;
    const double travel = direction * (s.v + v) * h * .5;
    double slip_change = slip_correction * lateral_scale;
    double lateral_travel = h * (s.lateral_v + .5 * h * slip_change);
    s.lateral_v += h * slip_change;
    const double yaw_step =
        std::clamp((s.ay - slip_change) * direction / std::max(1., (s.v + v) * .5) * h, -.3, .3);
    double heading_mid = s.heading + .5 * yaw_step;
    const double ds = (travel * std::cos(heading_mid) - lateral_travel * std::sin(heading_mid)) /
                      std::max(.35, 1 - frame.curvature * s.d) / std::sqrt(1 + square(frame.grade));
    if (ds >= 0)
        s.cursor = track.advance(s.cursor, ds, false);
    else {
        s.cursor.s += ds;
        if (s.cursor.s < 0) {
            s.cursor.s += road.length();
            --s.cursor.lap;
        }
    }
    s.d += travel * std::sin(heading_mid) + lateral_travel * std::cos(heading_mid);
    auto next = road.frame(s.cursor.s, s.d);
    double road_turn =
        std::atan2(frame.forward.x * next.forward.y - frame.forward.y * next.forward.x,
                   frame.forward.x * next.forward.x + frame.forward.y * next.forward.y);
    s.heading = std::remainder(s.heading + yaw_step - road_turn, 2 * std::numbers::pi);
    car.frame = next;
    s.distance += std::hypot(travel, lateral_travel);
    r.rpm = rpm;
    r.power = combustion;
    r.electric_kw = deployed - regen;
    r.drag = aero.drag;
    r.lift = aero.lift;
    r.front_aero = aero.front_fraction;
    r.airflow = aero.airflow;
    r.wake = wake;
    r.ax = s.ax;
    r.ay = s.ay;
    r.throttle = input.throttle;
    r.brake = input.brake;
    r.steer = input.steer;
    r.drs = drs;
}
} // namespace race
