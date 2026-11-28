#include "dynamics.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <set>
#include <stdexcept>

namespace race {
namespace {
void require(bool ok, const char *message) {
    if (!ok)
        throw std::invalid_argument(message);
}
bool in(double x, double lo, double hi) { return x >= lo && x <= hi; }
void validate(const Tyre &t) {
    require(in(t.surface, -100, 2000) && in(t.core, -100, 2000) && t.cycles >= 0 &&
                t.cycles < 100000000,
            "invalid tyre temperature or cycles");
    for (double x : {t.wear, t.degradation, t.grain, t.blister, t.flat})
        require(in(x, 0, 1), "invalid tyre condition");
}
void validate(const Control &c) {
    require(in(c.throttle, 0, 1) && in(c.brake, 0, 1) && in(c.steer, -.65, .65) &&
                in(c.clutch, 0, 1) && in(c.flag, 0, 2) && in(c.deploy, 0, 1) &&
                in(c.preference, -1, 1),
            "invalid control");
}
double forward_delta(const Cursor &a, const State &b, double len) {
    return (b.cursor.lap - a.lap) * len + b.cursor.s - a.s;
}
double ahead(double from, double to, double len) {
    return to >= from ? to - from : to - from + len;
}
struct Step {
    Cursor origin;
    double initial_v, initial_distance;
    Motion motion;
    Control input;
    double wake = 0, travel = 0, impact_speed = 0, impact_lateral = 0;
    std::vector<std::string> peers;
    int impacts = 0;
    bool held = false;
    bool hit = false;
    bool drs = false;
};
// Consume the tick in world-space intervals delimited by actual impacts.
// Between impulses the centre follows a chord and yaw interpolates continuously.
void resolve_contacts(std::vector<Step> &steps, const std::vector<Vehicle> &cars, std::int64_t tick,
                      Batch &batch) {
    double now = 0;
    auto move = [&](double fraction) {
        for (auto &st : steps) {
            auto &m = st.motion;
            auto end = interpolate(m.from, m.to, fraction);
            st.travel += std::hypot(end.centre.x - m.from.centre.x, end.centre.y - m.from.centre.y,
                                    end.centre.z - m.from.centre.z);
            m.from = end;
        }
    };
    while (steps.size() > 1) {
        double first = 2;
        size_t ai = 0, bi = 0;
        for (size_t i = 0; i < steps.size(); ++i)
            for (size_t j = i + 1; j < steps.size(); ++j) {
                if (steps[i].held && steps[j].held)
                    continue;
                auto &u = steps[i].motion, &v = steps[j].motion;
                double radius = (u.length + u.width + v.length + v.width) * .5;
                if (std::max(u.from.centre.x, u.to.centre.x) + radius <
                        std::min(v.from.centre.x, v.to.centre.x) ||
                    std::max(v.from.centre.x, v.to.centre.x) + radius <
                        std::min(u.from.centre.x, u.to.centre.x) ||
                    std::max(u.from.centre.y, u.to.centre.y) + radius <
                        std::min(v.from.centre.y, v.to.centre.y) ||
                    std::max(v.from.centre.y, v.to.centre.y) + radius <
                        std::min(u.from.centre.y, u.to.centre.y))
                    continue;
                double t = contact_time(u, v);
                if (t < first) {
                    first = t;
                    ai = i;
                    bi = j;
                }
            }
        if (first > 1)
            break;
        auto &a = steps[ai], &b = steps[bi];
        const double interval = (1 - now) * dt;
        auto velocity = [&](const Motion &m) {
            return Vec{(m.to.centre.x - m.from.centre.x) / interval,
                       (m.to.centre.y - m.from.centre.y) / interval, 0};
        };
        auto va = velocity(a.motion), vb = velocity(b.motion);
        Vec n = contact_normal(a.motion, b.motion, first);
        auto inv_mass = [&](size_t i) {
            auto &c = cars[i];
            return 1. / (c.spec.dry_mass + c.spec.driver_mass + c.state.fuel);
        };
        double ia = inv_mass(ai), ib = inv_mass(bi);
        double closing = (va.x - vb.x) * n.x + (va.y - vb.y) * n.y;
        double impulse = (1.08 * std::max(0., closing) + .002) / (ia + ib);
        va.x -= impulse * ia * n.x;
        va.y -= impulse * ia * n.y;
        vb.x += impulse * ib * n.x;
        vb.y += impulse * ib * n.y;
        move(first);
        now = std::lerp(now, 1., first);
        auto redirect = [&](Step &st, Vec v, bool reversing) {
            st.hit = true;
            auto &m = st.motion;
            double yaw = m.from.yaw;
            m.to.yaw = yaw;
            m.to.centre.x = m.from.centre.x + v.x * (1 - now) * dt;
            m.to.centre.y = m.from.centre.y + v.y * (1 - now) * dt;
            st.impact_speed =
                std::max(0., (reversing ? -1. : 1.) * (v.x * std::cos(yaw) + v.y * std::sin(yaw)));
            st.impact_lateral = -v.x * std::sin(yaw) + v.y * std::cos(yaw);
        };
        redirect(a, va, cars[ai].state.reversing);
        redirect(b, vb, cars[bi].state.reversing);
        // A pinched cluster may have no free displacement in the remaining
        // interval. Keep its boxes at time of impact, continue the other cars.
        ++a.impacts;
        ++b.impacts;
        if (a.impacts >= 5 || b.impacts >= 5 || a.held || b.held) {
            a.held = b.held = true;
            a.motion.to = a.motion.from;
            b.motion.to = b.motion.from;
        }
        const auto &peer = cars[bi].spec.id;
        if (std::find(a.peers.begin(), a.peers.end(), peer) == a.peers.end()) {
            a.peers.push_back(peer);
            const auto &previous = cars[ai].state.contact_peers;
            if (std::find(previous.begin(), previous.end(), peer) == previous.end())
                batch.events.push_back(
                    {"contact", cars[ai].spec.id, peer, (tick + now) * dt, 0, 0});
        }
        if (1 - now < 1e-9)
            break;
    }
    if (std::any_of(steps.begin(), steps.end(), [](auto &s) { return s.hit; }))
        move(1);
}
Sample sample(const Vehicle &car, std::int64_t tick) {
    const auto &s = car.state;
    const auto &r = car.reading;
    const auto world = pose(car.frame, s.heading);
    Sample row = {double(tick),
                  s.cursor.s,
                  s.d,
                  world.centre.x,
                  world.centre.y,
                  world.centre.z,
                  world.yaw,
                  s.distance,
                  double(s.completed_laps),
                  std::hypot(s.v, s.lateral_v),
                  s.ax,
                  s.ay,
                  s.fuel,
                  s.energy,
                  s.coolant,
                  double(s.reversing ? -1 : s.gear),
                  r.rpm,
                  r.power,
                  r.electric_kw,
                  r.throttle,
                  r.brake,
                  r.steer,
                  r.drs,
                  r.drag,
                  r.lift,
                  r.front_aero,
                  r.airflow,
                  r.wake,
                  double(s.contacted),
                  r.shift};
    row.reserve(97);
    for (size_t i = 0; i < 4; ++i) {
        const auto &t = s.tyres[i];
        const auto &w = r.wheels[i];
        row.insert(row.end(),
                   {t.surface, t.core, pressure_kpa(car.spec, t, i), t.wear, t.degradation, t.grain,
                    t.blister, t.flat, double(t.cycles), double(t.punctured), w.load, w.mu, w.fx,
                    w.fy, w.lock, w.slip_power});
    }
    const auto &profile = car.profile;
    if (!s.command.automatic || profile.speed.empty())
        row.insert(row.end(), {0., 0., 0.});
    else {
        double u = s.cursor.s / profile.step;
        size_t i = static_cast<size_t>(u) % profile.speed.size(),
               j = (i + 1) % profile.speed.size();
        for (auto series : {&profile.speed, &profile.curvature, &profile.offset})
            row.push_back(std::lerp((*series)[i], (*series)[j], u - std::floor(u)));
    }
    row.insert(row.end(), {r.wheelspin, r.clutch, r.push_force});
    return row;
}
} // namespace
Dynamics::Dynamics(const Track &track, Conditions env, std::vector<std::pair<Spec, Start>> entries)
    : track_(track), env_(std::move(env)) {
    require(!entries.empty() && entries.size() <= 128, "field size outside 1..128");
    require(in(env_.ambient, -40, 60) && in(env_.track_c, -40, 90) && in(env_.water_mm, 0, 20),
            "invalid surface conditions");
    double previous = 0;
    for (double gate : env_.sectors) {
        require(gate > previous && gate < 1, "invalid sector timing gate");
        previous = gate;
    }
    for (auto zone : env_.zones)
        require(in(zone[0], 0, 1) && in(zone[1], 0, 1) && zone[0] != zone[1], "invalid DRS zone");
    std::sort(entries.begin(), entries.end(),
              [](const auto &a, const auto &b) { return a.first.id < b.first.id; });
    std::vector<Body> bodies;
    const auto &road = track.ribbon(Road::circuit);
    for (auto &[p, start] : entries) {
        require(in(p.length, .6, 10) && in(p.width, .5, 4) && in(p.height, .25, 4) &&
                    in(p.wheelbase, .5, p.length) && in(p.dry_mass, 25, 5000) && in(p.gears, 1, 12),
                "invalid vehicle specification");
        require(in(start.s, 0, road.length()) && start.s < road.length() &&
                    in(start.d, -100, 100) && in(start.v, 0, 150) && in(start.fuel, 0, 250) &&
                    in(start.energy, 0, p.battery_kj) && in(start.heading, -3.15, 3.15),
                "invalid starting state");
        for (const auto &tyre : start.tyres)
            validate(tyre);
        State s;
        s.cursor = {Road::circuit, start.s, 0};
        s.d = start.d;
        s.v = start.v;
        s.heading = start.heading;
        if (start.s == 0)
            s.last_gate = 0;
        s.fuel = start.fuel;
        s.energy = start.energy;
        s.tyres = start.tyres;
        s.coolant = env_.ambient + 45;
        s.split_times.assign(env_.sectors.size(), -1.);
        s.detection_time.assign(env_.zones.size(), -10.);
        s.eligible.assign(env_.zones.size(), 0);
        bodies.push_back({p.id, s.cursor, s.d, p.length, p.width, p.height, s.heading});
        require(road.contains_footprint(bodies.back()),
                "full vehicle envelope extends outside grid surface");
        std::vector<double> ratios;
        for (int g = 0; g < p.gears; ++g)
            ratios.push_back(
                p.final_drive * p.first_ratio *
                std::pow(p.top_ratio / p.first_ratio, double(g) / std::max(1, p.gears - 1)));
        while (s.gear < p.gears &&
               start.v * ratios[s.gear - 1] / p.radius > .95 * p.redline * std::acos(-1.) / 30.)
            ++s.gear;
        cars_.push_back({std::move(p),
                         s,
                         {},
                         {},
                         std::move(ratios),
                         start.d,
                         start.s,
                         road.frame(s.cursor.s, s.d)});
        initialise_driver(cars_.back(), env_);
    }
    require(track.overlaps(bodies).empty(), "overlapping grid envelopes");
    // Unwrap the occupied grid arc across zero, independent of entry order.
    std::vector<double> stations;
    for (const auto &car : cars_)
        stations.push_back(car.grid_station);
    std::sort(stations.begin(), stations.end());
    double first = stations.front(), empty = road.length() + first - stations.back();
    for (size_t i = 1; i < stations.size(); ++i) {
        double gap = stations[i] - stations[i - 1];
        if (gap > empty) {
            empty = gap;
            first = stations[i];
        }
    }
    for (auto &car : cars_)
        car.grid_lap = car.grid_station < first ? 1 : 0;
}
void Dynamics::enqueue(std::vector<Order> orders) {
    require(orders.size() + orders_.size() <= 32768, "control queue capacity exceeded");
    orders.insert(orders.end(), orders_.begin(), orders_.end());
    std::sort(orders.begin(), orders.end(), [](const Order &a, const Order &b) {
        return std::tie(a.tick, a.entry) < std::tie(b.tick, b.entry);
    });
    for (size_t i = 0; i < orders.size(); ++i) {
        const auto &o = orders[i];
        require(o.tick >= tick_ && o.tick < 100000000000LL, "command outside session clock");
        auto car = std::lower_bound(cars_.begin(), cars_.end(), o.entry,
                                    [](const auto &v, const auto &id) { return v.spec.id < id; });
        require(car != cars_.end() && car->spec.id == o.entry, "unknown command entry");
        require(!i || orders[i - 1].entry != o.entry || orders[i - 1].tick != o.tick,
                "ambiguous control order");
        require(o.command.gear >= 0 && o.command.gear <= car->spec.gears,
                "gear unavailable on entry");
        validate(o.command);
    }
    orders_.swap(orders);
}
void Dynamics::restore(std::int64_t tick, std::vector<State> states, std::vector<Order> queue) {
    require(tick >= 0 && tick < 100000000000LL && states.size() == cars_.size(),
            "invalid checkpoint clock or field");
    for (size_t i = 0; i < states.size(); ++i) {
        const auto &s = states[i];
        const auto &p = cars_[i].spec;
        require(s.cursor.s >= 0 && s.cursor.s < track_.ribbon(Road::circuit).length() &&
                    in(s.cursor.lap, -1e9, 1e9) && in(s.d, -1e7, 1e7) && in(s.v, 0, 200) &&
                    in(s.lateral_v, -200, 200) && in(s.heading, -3.15, 3.15) &&
                    in(s.fuel, 0, 250) && in(s.energy, 0, p.battery_kj) && in(s.gear, 1, p.gears) &&
                    in(s.shift_left, 0, 2) && in(s.coolant, -100, 2000) &&
                    in(s.ax, -10000, 10000) && in(s.ay, -10000, 10000) &&
                    in(s.completed_laps, 0, 1e9) && in(s.last_gate_index, 0, 1e9) &&
                    in(s.distance, 0, 1e15) && in(s.last_gate, -1, double(tick) * dt) &&
                    in(s.used_kj, 0, 1e15) && in(s.recovered_kj, 0, 1e15) &&
                    s.detection_time.size() == env_.zones.size() &&
                    s.eligible.size() == env_.zones.size(),
                "invalid checkpoint state");
        for (double t : s.detection_time)
            require(in(t, -10, tick * dt), "invalid detection clock");
        for (int e : s.eligible)
            require(e == 0 || e == 1, "invalid detection eligibility");
        for (const auto &tyre : s.tyres)
            validate(tyre);
        require(s.command.gear >= 0 && s.command.gear <= p.gears &&
                    s.split_times.size() == env_.sectors.size(),
                "invalid checkpoint gear or timing");
        for (double time : s.split_times)
            require(in(time, -1, tick * dt), "invalid sector time");
        const auto &m = s.mind;
        require(in(m.tactic, 0, int(Tactic::pit)) && in(m.position, 0, cars_.size()) &&
                    in(m.lane, -1e7, 1e7) && in(m.gap, -1e7, 1e7) && in(m.speed_limit, 0, 2000) &&
                    in(m.sense_time, 0, tick * dt) && in(m.side, -1, 1) &&
                    in(m.radio_line, -1, 1) && in(m.crawl_speed, -3, 4) &&
                    in(m.crawl_steer, -.65, .65),
                "invalid checkpoint driver plan");
        for (auto value :
             {m.attention, m.confidence, m.fatigue, m.tension, m.composure, m.familiarity,
              m.pedal_limit, m.deploy, m.previous_throttle, m.radio_deploy, m.grip_estimate,
              m.wheelspin, m.lock, m.wake, m.blend, m.brake_ceiling})
            require(in(value, 0, 1), "invalid checkpoint driver feedback");
        for (auto clock : {m.next_scan, m.attack_ticks, m.retry_tick, m.rival_until, m.release_tick,
                           m.error_until, m.blocked_ticks, m.green_tick})
            require(clock >= 0 && clock <= 100000001000LL, "invalid checkpoint driver clock");
        for (const auto &id : {m.target, m.rival, m.defended})
            require(id.empty() ||
                        (id != p.id && std::any_of(cars_.begin(), cars_.end(),
                                                   [&](const auto &v) { return v.spec.id == id; })),
                    "unknown checkpoint opponent");
        validate(s.command);
    }
    // Called only on a freshly reconstructed session.
    require(tick_ == 0 && orders_.empty(), "restore requires a fresh session");
    for (const auto &order : queue)
        require(order.tick >= tick, "checkpoint contains past control");
    enqueue(std::move(queue));
    tick_ = tick;
    for (size_t i = 0; i < states.size(); ++i) {
        cars_[i].frame = track_.ribbon(Road::circuit).frame(states[i].cursor.s, states[i].d);
        cars_[i].state = std::move(states[i]);
    }
}
void Dynamics::step(Batch &batch) {
    const auto &road = track_.ribbon(Road::circuit);
    const double len = road.length();
    size_t consumed = 0;
    while (consumed < orders_.size() && orders_[consumed].tick == tick_) {
        auto &o = orders_[consumed++];
        auto it = std::lower_bound(
            cars_.begin(), cars_.end(), o.entry,
            [](const Vehicle &c, const std::string &id) { return c.spec.id < id; });
        if (!o.command.automatic && !it->state.mind.target.empty()) {
            batch.events.push_back({"attack-aborted", it->spec.id, it->state.mind.target,
                                    tick_ * dt, 0, it->state.completed_laps});
            it->state.mind.target.clear();
        }
        it->state.command = o.command;
    }
    if (consumed)
        orders_.erase(orders_.begin(), orders_.begin() + consumed);
    if (env_.formation && !cars_.front().state.mind.formation_done) {
        // The starter observes the grid and broadcasts a single release signal.
        bool ready = std::all_of(cars_.begin(), cars_.end(), [&](const Vehicle &c) {
            double left = (1 - c.state.cursor.lap) * len + c.grid_station - c.state.cursor.s;
            return c.state.mind.rolling ? left <= 0 : left < 2 && c.state.v < 1;
        });
        if (ready) {
            for (auto &c : cars_) {
                auto &m = c.state.mind;
                m.formation_done = true;
                m.roll_speed = c.state.v;
                m.release_tick += tick_;
                m.green_tick += tick_;
                c.state.last_gate = -1;
                c.state.completed_laps = 0;
            }
        }
    }
    std::vector<Step> steps(cars_.size());
    for (size_t i = 0; i < cars_.size(); ++i) {
        auto &car = cars_[i];
        auto &st = steps[i];
        const auto &s = car.state;
        const auto &p = car.spec;
        st.origin = s.cursor;
        st.initial_v = s.v;
        st.initial_distance = s.distance;
        st.motion = {pose(car.frame, s.heading), {}, p.length, p.width, p.height};
        st.motion.to = st.motion.from;

        for (size_t j = 0; j < cars_.size(); ++j) {
            if (i == j)
                continue;
            const auto &other = cars_[j];
            const auto &t = other.state;
            const double delta = ahead(s.cursor.s, t.cursor.s, len);
            if (delta > 160 || delta == 0)
                continue;
            const double space = delta - (p.length + other.spec.length) * .5;
            double lateral = std::abs(t.d - s.d);
            double wake_width = (other.spec.width + p.width) * .32 + .022 * delta;
            double source =
                std::clamp(.50 + .23 * other.spec.base_drag + .08 * other.spec.wing_area, .4, 1.);
            double receiver = std::clamp(.65 + .10 * p.floor_area, .6, 1.);
            double signal = source * receiver * std::clamp(t.v / 55., 0., 1.) *
                            std::clamp(s.v / 38., 0., 1.) *
                            std::exp(-std::max(0., space) / (19. + .34 * t.v) -
                                     .5 * lateral * lateral / (wake_width * wake_width));
            st.wake = std::max(st.wake, signal);
        }
        if (s.command.automatic) {
            plan(track_, car, env_, geometry_);
            think(track_, env_, cars_, i, tick_, batch);
        }
        const auto &mind = s.mind;
        double gap = mind.gap + (mind.lead_v - s.v) * (tick_ * dt - mind.sense_time);
        st.input = control(track_, car, gap, mind.lead_v);
        if (p.drs && env_.drs_enabled && env_.water_mm < .5 && st.input.drs &&
            st.input.brake == 0) {
            for (size_t z = 0; z < env_.zones.size(); ++z) {
                auto [a, b] = env_.zones[z];
                double f = s.cursor.s / len;
                bool inside = a < b ? (f >= a && f < b) : (f >= a || f < b);
                if (inside && (env_.unrestricted_drs || (s.completed_laps >= 1 && s.eligible[z])))
                    st.drs = true;
            }
        }
    }
    for (size_t i = 0; i < cars_.size(); ++i) {
        auto &car = cars_[i];
        auto &st = steps[i];
        auto &s = car.state;
        s.contacted = false;
        integrate(track_, car, env_, st.wake, st.drs, st.input);
        st.impact_speed = s.v;
        st.impact_lateral = s.lateral_v;
        st.motion.to = pose(car.frame, s.heading);
    }
    resolve_contacts(steps, cars_, tick_, batch);
    struct Detection {
        double time;
        size_t zone, car;
    };
    std::vector<Detection> detections;
    for (size_t i = 0; i < cars_.size(); ++i) {
        auto &car = cars_[i];
        auto &s = car.state;
        const auto &st = steps[i];

        double ds = forward_delta(st.origin, s, len);
        if (st.hit) {
            const auto impact = st.motion.to;
            s.distance = st.initial_distance + st.travel;
            // Invert the local horizontal frame. A global closest 3D point
            // can be on a different branch or station on a banked road.
            double station = st.origin.s + ds;
            for (int iter = 0; iter < 8; ++iter) {
                auto f = road.frame(station);
                double dx = impact.centre.x - f.point.x, dy = impact.centre.y - f.point.y;
                s.d = -dx * f.forward.y + dy * f.forward.x;
                double error = dx * f.forward.x + dy * f.forward.y;
                if (std::abs(error) < 1e-10)
                    break;
                station += error / std::max(.35, 1 - f.curvature * s.d);
            }
            double lap = std::floor(station / len);
            s.cursor = {Road::circuit, station - lap * len,
                        st.origin.lap + static_cast<std::int64_t>(lap)};
            car.frame = road.frame(s.cursor.s, s.d);
            s.heading = std::remainder(impact.yaw - pose(car.frame, 0).yaw, 2 * std::acos(-1.));
            s.v = st.impact_speed;
            s.ay += (st.impact_lateral - s.lateral_v) / dt;
            s.lateral_v = st.impact_lateral;
            s.ax = (s.v - st.initial_v) / dt;
            s.contacted = true;
        }
        auto &mind = s.mind;
        if (mind.launch_pending && (mind.rolling || s.v > .01)) {
            const char *kind = tick_ < mind.green_tick ? "false-start"
                               : mind.rolling          ? "rolling-start"
                                                       : "standing-start";
            batch.events.push_back({kind, car.spec.id, "", (tick_ + 1) * dt, 0, s.completed_laps});
            mind.launch_pending = false;
        }
        mind.previous_throttle = car.reading.throttle;
        mind.last_brake = car.reading.brake;
        mind.wheelspin = car.reading.wheelspin;
        mind.wake = st.wake;
        mind.lock = 0;
        for (const auto &w : car.reading.wheels)
            mind.lock = std::max(mind.lock, w.lock);
        // A locking tyre gives the driver a measured safe pedal pressure.
        // Reapply progressively as the car straightens and load returns.
        if (mind.lock > .01)
            mind.brake_ceiling =
                std::min(mind.brake_ceiling,
                         mind.last_brake / (1 + mind.lock) * (.89 + .06 * car.spec.driver.braking));
        else
            mind.brake_ceiling =
                std::min(1., mind.brake_ceiling + dt * (.035 + .05 * car.spec.driver.braking));
        s.contact_peers = st.peers;
        double moved = forward_delta(st.origin, s, len);
        if (moved <= 0)
            continue;
        auto crossing = [&](double gate) {
            double travel = ahead(st.origin.s, gate, len);
            if (travel == 0)
                travel = len;
            return travel <= moved ? (tick_ + travel / moved) * dt : -1.;
        };
        for (size_t j = 0; j < env_.sectors.size(); ++j) {
            double split = crossing(env_.sectors[j] * len);
            if (split >= 0)
                s.split_times[j] = split;
        }
        double finish = crossing(0);
        if (finish >= 0 && s.cursor.lap > s.last_gate_index) {
            s.last_gate_index = s.cursor.lap;
            if (s.last_gate >= 0 && s.mind.formation_done)
                batch.events.push_back({"lap", car.spec.id, "", finish, finish - s.last_gate,
                                        ++s.completed_laps, s.split_times});
            s.last_gate = finish;
            s.used_kj = s.recovered_kj = 0;
        }
        for (size_t z = 0; z < env_.zones.size(); ++z) {
            double t = crossing(std::fmod(env_.zones[z][0] * len - 150 + len, len));
            if (t >= 0)
                detections.push_back({t, z, i});
        }
    }
    std::sort(detections.begin(), detections.end(),
              [](auto a, auto b) { return std::tie(a.time, a.car) < std::tie(b.time, b.car); });
    for (auto [time, zone, i] : detections) {
        double latest = -10.;
        for (size_t j = 0; j < cars_.size(); ++j)
            if (j != i)
                latest = std::max(latest, cars_[j].state.detection_time[zone]);
        cars_[i].state.eligible[zone] = time - latest <= 1.;
        cars_[i].state.detection_time[zone] = time;
    }
    for (auto &c : cars_)
        finish_attack(c, cars_, len, tick_ + 1, batch);
    std::vector<size_t> order(cars_.size());
    for (size_t i = 0; i < order.size(); ++i)
        order[i] = i;
    std::stable_sort(order.begin(), order.end(), [&](size_t a, size_t b) {
        const auto &u = cars_[a].state.cursor, &v = cars_[b].state.cursor;
        return std::pair{u.lap + cars_[a].grid_lap, u.s} >
               std::pair{v.lap + cars_[b].grid_lap, v.s};
    });
    for (size_t i = 0; i < order.size(); ++i) {
        auto &c = cars_[order[i]];
        auto &pos = c.state.mind.position;
        if (pos != int(i + 1) && (pos || env_.race_start))
            batch.events.push_back({"position",
                                    c.spec.id,
                                    "",
                                    (tick_ + 1) * dt,
                                    0,
                                    c.state.completed_laps,
                                    {},
                                    int(i + 1)});
        pos = int(i + 1);
    }
    ++tick_;
}
Batch Dynamics::advance(int ticks, int stride) {
    require(ticks >= 0 && ticks <= 1000000 && stride >= 0 && stride <= 1000000,
            "invalid batch length or sample period");
    require(static_cast<size_t>(ticks) * cars_.size() <= 262144,
            "vehicle-tick batch capacity exceeded");
    require(!stride || ((tick_ + ticks) / stride - tick_ / stride) * cars_.size() <= 32768,
            "telemetry batch capacity exceeded");
    Batch batch;
    for (int i = 0; i < ticks; ++i) {
        step(batch);
        if (stride && tick_ % stride == 0)
            for (const auto &car : cars_)
                batch.rows[car.spec.id].push_back(sample(car, tick_));
    }
    return batch;
}
} // namespace race
