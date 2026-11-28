#include "dynamics.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <functional>

namespace race {
namespace {
double friction_budget(double capacity, double lateral) {
    return std::sqrt(std::max(0., capacity * capacity - lateral * lateral));
}
// A single hydraulic pressure serves both axles. Find the largest total
// longitudinal force for which every braked wheel can hold its contact patch.
double braking_force(const Spec &p, double mass, double mu, const Forces &aero, double lateral) {
    double normal = mass * gravity + aero.lift;
    double front_static = p.front_weight * mass * gravity + aero.front_fraction * aero.lift;
    double transfer = mass * lateral * p.cg_height / (p.width * .83);
    double lo = 0, hi = std::min(p.brake_nm / p.radius, mu * normal);
    for (int it = 0; it < 7; ++it) {
        double force = (lo + hi) * .5;
        double front = std::clamp(front_static + force * p.cg_height / p.wheelbase, .05 * normal,
                                  .95 * normal);
        bool fits = true;
        for (int i = 0; i < 4; ++i) {
            bool f = i < 2;
            double axle = f ? front : normal - front;
            double delta =
                std::clamp(transfer * (f ? p.antiroll : 1 - p.antiroll), -.48 * axle, .48 * axle);
            double load = axle * .5 + (i % 2 ? 1 : -1) * delta;
            double fy = mass * lateral * (f ? p.front_weight : 1 - p.front_weight) * load / axle;
            double fx = force * (f ? p.bias : 1 - p.bias) * .5;
            if (fx > friction_budget(mu * load, fy))
                fits = false;
        }
        if (fits)
            lo = force;
        else
            hi = force;
    }
    return lo;
}
double interp(const std::vector<double> &v, double u) {
    auto i = static_cast<size_t>(u) % v.size();
    return std::lerp(v[i], v[(i + 1) % v.size()], u - std::floor(u));
}
double signed_curvature(const Vec &a, const Vec &b, const Vec &c) {
    double ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
    return 2 * (ux * vy - uy * vx) /
           std::max(.001,
                    std::hypot(ux, uy) * std::hypot(vx, vy) * std::hypot(c.x - a.x, c.y - a.y));
}
Candidates geometry(const Track &track, const Spec &p) {
    Candidates candidates;
    const auto &road = track.ribbon(Road::circuit);
    const size_t n = std::max<size_t>(32, std::ceil(road.length() / (p.kart ? 2.5 : 5.)));
    const double step = road.length() / n;
    Lines lines(track, p.width, .35, std::clamp(3 * p.wheelbase + .012 * p.power_kw, 4., 26.));
    // Minimise the squared changes of direction in world XY. Merely
    // shortening a line pulls every circular bend to its inside edge and
    // reproduces individual survey vertices as braking zones.
    std::vector<Frame> axis(n);
    std::vector<double> offset(n), lower(n), upper(n);
    std::vector<Vec> points(n);
    for (size_t i = 0; i < n; ++i) {
        axis[i] = road.frame(i * step);
        offset[i] = lines.offset(i * step, 0);
        auto &f = axis[i];
        lower[i] = -f.section.right + p.width / 2 + .35;
        upper[i] = f.section.left - p.width / 2 - .35;
        if (f.curvature < 0)
            lower[i] = std::max(lower[i], .75 / f.curvature);
        if (f.curvature > 0)
            upper[i] = std::min(upper[i], .75 / f.curvature);
        points[i] = road.frame(i * step, offset[i]).point;
    }
    // Coordinate descent of sum |P[i-h]-2P[i]+P[i+h]|².
    // Coarse sweeps propagate bend entry/exit geometry along the straight.
    // Only the local normal coordinate is free, within the drivable ribbon.
    for (size_t h : {8u, 4u, 2u, 1u}) {
        for (int sweep = 0; sweep < 48; ++sweep) {
            double largest = 0;
            for (size_t j = 0; j < n; ++j) {
                size_t i = sweep % 2 ? n - 1 - j : j;
                auto &a = points[(i + n - 2 * h) % n], &b = points[(i + n - h) % n];
                auto &c = points[(i + h) % n], &d = points[(i + 2 * h) % n];
                const auto &f = axis[i];
                double nx = -f.forward.y, ny = f.forward.x;
                double x = (4 * (b.x + c.x) - a.x - d.x) / 6 - f.point.x;
                double y = (4 * (b.y + c.y) - a.y - d.y) / 6 - f.point.y;
                double next = std::clamp(x * nx + y * ny, lower[i], upper[i]);
                largest = std::max(largest, std::abs(next - offset[i]));
                offset[i] = next;
                points[i].x = f.point.x + nx * next;
                points[i].y = f.point.y + ny * next;
            }
            if (largest < .001)
                break;
        }
    }
    // Refine using curvature of the displaced points: station spacing on
    // the road axis differs from distance along the line in a hairpin.
    auto geometric = offset;
    for (size_t h : {4u, 2u, 1u}) {
        for (int sweep = 0; sweep < 36; ++sweep) {
            for (size_t j = 0; j < n; ++j) {
                size_t i = sweep % 2 ? n - 1 - j : j;
                auto &a = points[(i + n - 2 * h) % n], &b = points[(i + n - h) % n];
                auto &c = points[(i + h) % n], &d = points[(i + 2 * h) % n];
                auto &pt = points[i];
                double k = signed_curvature(b, pt, c);
                double target = .5 * (signed_curvature(a, b, pt) + signed_curvature(pt, c, d));
                double arm = std::hypot(c.x - b.x, c.y - b.y) * .5;
                double next =
                    std::clamp(geometric[i] + (k - target) * arm * arm / 3., lower[i], upper[i]);
                const auto &f = axis[i];
                pt.x = f.point.x - f.forward.y * next;
                pt.y = f.point.y + f.forward.x * next;
                geometric[i] = next;
            }
        }
    }
    for (const auto &candidate : {std::cref(offset), std::cref(geometric)}) {
        std::vector<Frame> frames;
        std::vector<LinePoint> path(n);
        for (size_t i = 0; i < n; ++i) {
            path[i].d = candidate.get()[i];
            frames.push_back(road.frame(i * step, path[i].d));
        }
        for (size_t i = 0; i < n; ++i) {
            auto a = frames[(i + n - 1) % n].point, b = frames[i].point,
                 c = frames[(i + 1) % n].point;

            auto &pt = path[i];
            pt.ds = std::max(.01, std::hypot(c.x - b.x, c.y - b.y));
            pt.curvature = signed_curvature(a, b, c);
            pt.grade = (c.z - b.z) / pt.ds;
            pt.crossfall = frames[i].section.crossfall;
            pt.roughness = frames[i].section.roughness;
        }
        candidates.push_back(std::move(path));
    }
    return candidates;
}
} // namespace
void plan(const Track &track, Vehicle &car, const Conditions &env, GeometryCache &cache) {
    auto &profile = car.profile;
    const auto &p = car.spec;
    const auto &s = car.state;
    double mu = 0, mass = p.dry_mass + p.driver_mass + s.fuel;
    // The engineering envelope uses onboard temperature and pressure readings
    // and an estimate of tyre condition. Internal carcass damage is unavailable.
    for (size_t i = 0; i < s.tyres.size(); ++i) {
        const auto &actual = s.tyres[i];
        Tyre estimated{};
        estimated.surface = 2 * std::round(actual.surface / 2);
        estimated.wear = .05 * std::round(actual.wear / .05);
        double pressure = std::round(pressure_kpa(p, actual, i));
        estimated.punctured = pressure < 35;
        // Coarse condition bands inferred from tyre vibration and infrared
        // readings, as opposed to exact continuous per-wheel internal state.
        estimated.flat = .2 * std::round(actual.flat * 5);
        estimated.blister = .25 * std::round(actual.blister * 4);
        estimated.grain = .25 * std::round(actual.grain * 4);
        estimated.degradation = .25 * std::round(actual.degradation * 4);
        mu += .25 * tyre_mu(p, estimated, mass * gravity / 4, pressure,
                            .1 * std::round(env.water_mm * 10), 30.);
    }
    int grip_bin = std::clamp(int(std::floor(mu * 10)), 1, 35);
    int mass_bin = int(std::floor(mass / 10));
    if (grip_bin == profile.grip_bin && mass_bin == profile.mass_bin)
        return;
    profile.grip_bin = grip_bin;
    profile.mass_bin = mass_bin;
    mu = (grip_bin + .3) / 10.;
    mass = (mass_bin + .5) * 10.;
    if (!profile.candidates) {
        auto &shared = cache[{p.kart, p.width, p.wheelbase, p.power_kw}];
        if (!shared)
            shared = std::make_shared<const Candidates>(geometry(track, p));
        profile.candidates = shared;
        profile.step = track.ribbon(Road::circuit).length() / shared->front().size();
    }
    double best = std::numeric_limits<double>::infinity();
    for (const auto &path : *profile.candidates) {
        size_t n = path.size();
        std::vector<double> v(n);
        const double max_v = p.redline * .104719755 * p.radius / car.ratios.back();
        for (size_t i = 0; i < n; ++i) {
            const auto &pt = path[i];
            double lo = 0, hi = max_v;
            for (int k = 0; k < 10; ++k) {
                double speed = (lo + hi) * .5;
                auto aero = aerodynamics(p, speed, 0, false, pt.roughness);
                if (std::abs(speed * speed * pt.curvature + gravity * pt.crossfall) <=
                        .91 * mu * (gravity + aero.lift / mass) &&
                    speed * (aero.drag + .014 * mass * gravity) < p.power_kw * 1000 * p.efficiency)
                    lo = speed;
                else
                    hi = speed;
            }
            v[i] = lo;
        }
        for (int pass = 0; pass < 2; ++pass) {
            for (size_t j = n; j-- > 0;) {
                auto next = (j + 1) % n;
                const auto &pt = path[j];
                double speed = v[next];
                auto aero = aerodynamics(p, speed, 0, false, pt.roughness);
                double lateral = pt.curvature * speed * speed + gravity * pt.crossfall;
                double brake = braking_force(p, mass, mu, aero, lateral) / mass;
                v[j] = std::min(
                    v[j], std::sqrt(std::max(1., speed * speed + 2 * pt.ds *
                                                                     (brake + aero.drag / mass +
                                                                      gravity * pt.grade))));
            }
            for (size_t j = 0; j < n; ++j) {
                auto next = (j + 1) % n;
                auto aero = aerodynamics(p, v[j], 0, false, path[j].roughness);
                double capacity = mu * (gravity + aero.lift / mass);
                double lateral = path[j].curvature * v[j] * v[j] + gravity * path[j].crossfall;
                double driven =
                    (1 - p.front_weight) * gravity + (1 - aero.front_fraction) * aero.lift / mass;
                double drive =
                    std::min(std::min(mu * driven, friction_budget(capacity, lateral)),
                             p.power_kw * 1000 * p.efficiency / (mass * std::max(1., v[j])));
                double accel = drive - aero.drag / mass - gravity * (.014 + path[j].grade);
                v[next] = std::min(v[next],
                                   std::sqrt(std::max(1., v[j] * v[j] + 2 * accel * path[j].ds)));
            }
        }
        double time = 0;
        for (size_t i = 0; i < n; ++i)
            time += 2 * path[i].ds / std::max(.1, v[i] + v[(i + 1) % n]);
        if (time < best) {
            best = time;
            profile.speed = std::move(v);
            profile.offset.resize(n);
            profile.curvature.resize(n);
            profile.tangent.resize(n);
            profile.acceleration.resize(n);
            for (size_t i = 0; i < n; ++i) {
                size_t prev = (i + n - 1) % n, next = (i + 1) % n;
                profile.offset[i] = path[i].d;
                profile.curvature[i] = path[i].curvature;
                profile.tangent[i] = std::asin(std::clamp(
                    (path[next].d - path[prev].d) / (path[i].ds + path[prev].ds), -.95, .95));
                profile.acceleration[i] = (profile.speed[next] * profile.speed[next] -
                                           profile.speed[i] * profile.speed[i]) /
                                          (2 * path[i].ds);
            }
        }
    }
}
Control control(const Track &track, const Vehicle &car, double gap, double leader_v) {
    const auto &s = car.state;
    auto input = s.command;
    if (!input.automatic)
        return input;
    const auto &p = car.spec;
    const auto &road = track.ribbon(Road::circuit);
    const auto &profile = car.profile;
    const double look = std::clamp(p.wheelbase * 1.6 + .29 * s.v, p.wheelbase * 1.6, 27.);
    double blend = std::min(1., s.distance / (p.kart ? 60. : 8 * p.length));
    double curvature;
    const double u = s.cursor.s / profile.step;
    const auto &mind = s.mind;
    const auto &driver = p.driver;
    double apex =
        (driver.balance - .5) * .25 + (driver.fast_bends - .5) * .12 * std::min(1., s.v / 55.);
    apex += mind.miss * (driver.balance > .5 ? 1. : -1.);
    input.ignition = input.ignition && !mind.cranking;
    input.preference = mind.radio_line;
    if (mind.blend == 0 && input.preference == 0 && blend == 1 &&
        std::abs(s.d - interp(profile.offset, u)) < p.width && std::abs(s.heading) < 1.2) {
        // Follow the tangent and signed curvature at the car, including when
        // the chord to a distant pursuit point would cut across a chicane.
        const double tangent = interp(profile.tangent, u);
        const double error = (interp(profile.offset, u) + apex - s.d) * std::cos(tangent);
        curvature = interp(profile.curvature, u) + 2 * std::sin(tangent - s.heading) / look +
                    2 * error / (look * look);
    } else {
        double ahead = std::fmod(s.cursor.s + look, road.length());
        auto destination = road.frame(ahead);
        double offset = interp(profile.offset, ahead / profile.step);
        double edge = input.preference > 0 ? destination.section.left - p.width / 2 - .25
                                           : -destination.section.right + p.width / 2 + .25;
        offset = std::lerp(offset + apex, mind.lane, mind.blend);
        offset = std::lerp(offset, edge, std::abs(input.preference));
        if (!mind.blend)
            offset = std::lerp(car.grid_offset, offset, blend * blend * (3 - 2 * blend));
        offset = std::clamp(offset, -destination.section.right + p.width / 2,
                            destination.section.left - p.width / 2);
        auto target = road.frame(ahead, offset).point;
        auto here = pose(car.frame, s.heading);
        double dx = target.x - here.centre.x, dy = target.y - here.centre.y;
        curvature = 2 * (-std::sin(here.yaw) * dx + std::cos(here.yaw) * dy) /
                    std::max(.2, dx * dx + dy * dy);
    }
    curvature -=
        std::clamp(s.lateral_v, -3., 3.) * (.25 + .6 * driver.cornering) / std::max(4., s.v * look);
    if (std::abs(s.heading) > 1.5 && s.v < 12)
        curvature = -std::copysign(.58 / p.wheelbase, s.heading);
    input.steer = std::clamp(std::atan(p.wheelbase * curvature), -.6, .6);
    const auto &frame = car.frame;
    double mass = p.dry_mass + p.driver_mass + s.fuel;
    auto aero = aerodynamics(p, s.v, 0, false, frame.section.roughness);
    double mu = (profile.grip_bin + .3) / 10.;
    double target_speed = interp(profile.speed, u);
    // Capture a displaced car on the actually requested arc. Brake early
    // enough to enter a tighter turn with a free lateral force budget.
    double preview =
        interp(profile.speed,
               std::fmod(s.cursor.s + mind.brake_preview * s.v, road.length()) / profile.step);
    target_speed = std::min(target_speed, preview);
    double lateral_limit = mu * (gravity + aero.lift / mass);
    if (frame.section.surface(s.d) == Surface::outside)
        lateral_limit *= .43;
    target_speed =
        std::min(target_speed, std::sqrt(lateral_limit / std::max(.0001, std::abs(curvature))));
    double goal = std::min(target_speed, mind.speed_limit);
    // Feedback guard for the occupied corridor in the last driver scan.
    if (gap < 100) {
        // Both cars can brake. Keep a reaction distance plus the difference
        // of stopping distances, including at rolling-grid speed.
        const double decel = std::min(p.brake_nm / p.radius / (p.dry_mass + p.driver_mass + s.fuel),
                                      p.mu * gravity * (p.kart ? .42 : .70));
        double launch = std::clamp(s.distance / (30 * p.length), 0., 1.);
        double headway = p.kart ? std::lerp(.10, .82, launch) : std::lerp(.24, .62, launch);
        headway *= .80 + .25 * (1 - driver.risk) + .20 * (1 - mind.attention);
        double reaction = decel * headway;
        double clear = p.kart ? .50 : .85;
        if (leader_v < 2 && s.v > 3)
            clear += p.wheelbase;
        double safe = std::sqrt(std::max(0., reaction * reaction + leader_v * leader_v +
                                                 2 * decel * (gap - clear))) -
                      reaction;
        goal = std::min(goal, std::max(0., safe));
    }
    double resistance =
        aero.drag + mass * gravity * (frame.grade + .013 + .4 * frame.section.roughness);
    double accel =
        (goal == target_speed ? interp(profile.acceleration, u) : 0.) + (goal - s.v) / .22;
    double demand = mass * accel + resistance;
    double capacity = (profile.grip_bin + .3) / 10. * (mass * gravity + aero.lift);
    double available = friction_budget(capacity, mass * s.v * s.v * curvature);
    // In a saturated turn allow the lateral controller to recover the path.
    double drive = std::min(p.power_kw * 1000 * p.efficiency / std::max(1., s.v),
                            p.torque_nm * car.ratios[s.gear - 1] * p.efficiency / p.radius);
    input.throttle = std::clamp(std::min(demand, available) / std::max(1., drive), 0., 1.);
    input.brake = 0;
    if (demand < 0) {
        double lateral = s.v * s.v * curvature + gravity * frame.section.crossfall;
        if (mind.blend > 0 && s.v > goal + 1) {
            // Understeering on a tight requested arc can consume the entire
            // friction circle. Unwind the wheel while slowing to regain the line.
            double reserve = .62 * lateral_limit;
            lateral = std::clamp(lateral, -reserve, reserve);
            input.steer = std::atan(p.wheelbase * (lateral - gravity * frame.section.crossfall) /
                                    std::max(1., s.v * s.v));
        }
        double hydraulic = braking_force(p, mass, (profile.grip_bin + .3) / 10., aero, lateral);
        input.brake = std::min(-demand, hydraulic) * p.radius / std::max(1., p.brake_nm);
    }
    double opening = (2.5 + 4 * driver.pace + 2 * driver.exit) * (1 - .28 * driver.smooth);
    if (s.distance < 3 * p.length && !mind.rolling)
        opening *= .30 + driver.pace * .65 + mind.launch_slip;
    input.throttle =
        std::min({input.throttle, mind.pedal_limit, mind.previous_throttle + opening * dt});
    input.brake = std::min(input.brake, mind.brake_ceiling) * (1 - mind.miss);
    input.deploy = mind.deploy;
    if (!p.kart && !mind.rolling && s.v < 12 && s.distance < 4 * p.length) {
        input.clutch = std::clamp(.38 + .24 * driver.launch + .045 * s.v + mind.launch_slip -
                                      .28 * mind.wheelspin,
                                  .1, 1.);
    }
    if (mind.lock > .04)
        input.brake *= 1 - std::min(.65, mind.lock * (.5 + driver.braking));
    if (goal <= .05)
        input.throttle = 0;
    if (mind.jam && mind.crawl_speed != 0 && s.command.flag == 0) {
        double target = std::abs(mind.crawl_speed);
        input.reverse = mind.crawl_speed < 0;
        input.steer = mind.crawl_steer;
        input.throttle = std::clamp((target - s.v) * .45, 0., .55);
        input.brake = std::clamp((s.v - target) * .45, 0., .45);
        input.push = p.kart && s.v < target && s.v < 2.4;
    }
    return input;
}
} // namespace race
