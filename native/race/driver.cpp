#include "dynamics.hpp"
#include <algorithm>
#include <cmath>
#include <limits>

namespace race {
namespace {
using Clock = std::int64_t;
double unit(double x) { return std::clamp(x, 0., 1.); }
// SplitMix64, one independent stream per admitted person.
double draw(Mind &m) {
    auto x = (m.rng += UINT64_C(0x9e3779b97f4a7c15));
    x = (x ^ (x >> 30)) * UINT64_C(0xbf58476d1ce4e5b9);
    x = (x ^ (x >> 27)) * UINT64_C(0x94d049bb133111eb);
    return double((x ^ (x >> 31)) >> 11) * 0x1.0p-53;
}
struct Seen {
    std::string id;
    double ds, d, speed, drift, half_length, half_width;
    bool different_class, lapping, crossing;
    Motion box;
};
double longitudinal(const Vehicle &v) {
    return std::abs(std::cos(v.state.heading)) * v.spec.length +
           std::abs(std::sin(v.state.heading)) * v.spec.width;
}
double lateral(const Vehicle &v) {
    return std::abs(std::cos(v.state.heading)) * v.spec.width +
           std::abs(std::sin(v.state.heading)) * v.spec.length;
}
std::vector<Seen> observe(const Vehicle &ego, const std::vector<Vehicle> &field, double length,
                          double water) {
    const auto &s = ego.state;
    const auto &m = s.mind;
    double vision = (55 + 95 * m.attention) / (1 + .20 * water);
    std::vector<Seen> nearby;
    for (const auto &v : field) {
        if (&ego == &v)
            continue;
        const auto &t = v.state;
        double ds = std::remainder(t.cursor.s - s.cursor.s, length);

        auto ray = Vec{v.frame.point.x - ego.frame.point.x, v.frame.point.y - ego.frame.point.y,
                       v.frame.point.z - ego.frame.point.z};
        double lateral_ray = -ray.x * ego.frame.forward.y + ray.y * ego.frame.forward.x;
        double physical = std::hypot(ray.x, ray.y);
        bool crossing =
            std::abs(ds) > physical + 12 && physical < 28 &&
            (std::abs(s.d) > ego.frame.section.left || std::abs(t.d) > v.frame.section.left);
        if (std::abs(ray.z) > 2 + .08 * physical)
            continue;
        double facing = ray.x * ego.frame.forward.x + ray.y * ego.frame.forward.y;
        if (crossing)
            ds = facing;
        if (ds > vision || ds < -(12 + 30 * m.attention) / (1 + .08 * water))
            continue;
        if (ds > 10 && facing < .55 * ds)
            continue;
        nearby.push_back({v.spec.id,
                          ds,
                          crossing ? s.d + lateral_ray : t.d,
                          crossing ? 0. : (t.reversing ? -1. : 1.) * t.v * std::cos(t.heading),
                          t.v * std::sin(t.heading) + t.lateral_v,
                          .5 * (longitudinal(ego) + longitudinal(v)),
                          .5 * (lateral(ego) + lateral(v)),
                          ego.spec.driver.category != v.spec.driver.category,
                          (t.cursor.lap + v.grid_lap - s.cursor.lap - ego.grid_lap) +
                                  std::llround((t.cursor.s - s.cursor.s - ds) / length) >
                              0,
                          crossing,
                          {pose(v.frame, t.heading), pose(v.frame, t.heading), v.spec.length,
                           v.spec.width, v.spec.height}});
    }
    std::stable_sort(nearby.begin(), nearby.end(),
                     [](auto &a, auto &b) { return std::abs(a.ds) < std::abs(b.ds); });
    std::vector<Seen> visible;
    const double precision = .10 + .65 * (1 - m.attention);
    for (auto v : nearby) {
        bool hidden = std::any_of(visible.begin(), visible.end(), [&](const Seen &block) {
            if (v.ds * block.ds <= 0 || std::abs(v.ds) - std::abs(block.ds) < ego.spec.length)
                return false;
            double intercept = s.d + (v.d - s.d) * block.ds / v.ds;
            return std::abs(intercept - block.d) < .36 * block.half_width;
        });
        if (hidden)
            continue;
        v.ds = std::round(v.ds / precision) * precision;
        v.speed = std::round(v.speed / (2 * precision)) * 2 * precision;
        v.d = std::round(v.d / (.25 * precision)) * .25 * precision;
        visible.push_back(v);
    }
    return visible;
}
void event(Batch &b, const Vehicle &c, Clock tick, const std::string &kind,
           const std::string &other = {}) {
    b.events.push_back({kind, c.spec.id, other, tick * dt, 0, c.state.completed_laps, {}});
}
double lookup(const Vehicle &car, const std::vector<double> &series, double ahead) {
    double u = (car.state.cursor.s + ahead) / car.profile.step;
    auto i = static_cast<size_t>(u) % series.size();
    return std::lerp(series[i], series[(i + 1) % series.size()], u - std::floor(u));
}
struct Scene {
    const Seen *front = nullptr, *rear = nullptr, *beside = nullptr, *target = nullptr;
};
Scene assess(const std::vector<Seen> &objects, const Vehicle &car) {
    Scene scene;
    for (const auto &v : objects) {
        if (v.id == car.state.mind.target)
            scene.target = &v;
        if (!scene.front && v.ds > 0)
            scene.front = &v;
        if (!scene.rear && v.ds < 0)
            scene.rear = &v;
        if (!scene.beside && std::abs(v.ds) < v.half_length + .5)
            scene.beside = &v;
    }
    return scene;
}
void abort_attack(Vehicle &car, Clock tick, Batch &b) {
    auto &m = car.state.mind;
    if (m.target.empty())
        return;
    event(b, car, tick, "attack-aborted", m.target);
    m.target.clear();
    m.retry_tick = tick + 65;
    m.confidence = unit(m.confidence - .025 * (1 - car.spec.driver.resolve));
}
void update_person(Vehicle &car, const Scene &scene, double seconds, double water, Clock tick,
                   Batch &b) {
    auto &s = car.state;
    auto &m = s.mind;
    const auto &p = car.spec.driver;
    double pressure = scene.rear ? unit(1 + scene.rear->ds / (9 + .55 * s.v)) : 0;
    m.tension += seconds * (pressure - m.tension) * (.14 + .22 * (1 - p.pressure));
    m.fatigue = unit(m.fatigue + seconds * (1 + .6 * m.tension + .03 * std::abs(s.ay)) /
                                     (7200 + 14400 * p.endurance));
    double slip = unit(std::abs(s.lateral_v) / 5 + m.lock + std::abs(s.heading) * .28);
    m.composure += seconds * (1 - slip - m.composure) * (.2 + .5 * p.feedback);
    m.confidence +=
        seconds * ((.55 + .35 * m.composure) - m.confidence) * (.012 + .035 * p.resolve);
    m.attention = unit(.42 + .32 * p.consistency + .26 * m.composure - .38 * m.fatigue +
                       .05 * p.experience - .24 * m.tension * (1.3 - p.pressure));
    m.familiarity +=
        seconds * (1 - m.familiarity) * (.001 + .003 * p.adaptability) * (.55 + .45 * m.composure);
    double felt = unit(1 - .37 * slip - .21 * water / (1 + p.rain) - .17 * (1 - m.familiarity));
    m.grip_estimate += seconds * (felt - m.grip_estimate) * (.4 + .9 * p.feedback);
    if (tick >= m.error_until) {
        m.miss = 0;
        // Exposure is per simulated second under load. Only the input is perturbed.
        double load = unit(std::abs(s.ay) / 18 + m.last_brake + m.tension);
        double rate = .0007 + .016 * (1 - p.consistency) * (1 + m.fatigue + m.tension);
        if (s.v > 9 && draw(m) < seconds * rate * load) {
            m.miss = (.18 + .42 * draw(m)) * (1 + .5 * m.tension);
            m.error_until = tick + 15 + int(20 * draw(m));
            m.confidence = unit(m.confidence - .06 * (1.2 - p.resolve));
            event(b, car, tick, m.last_brake > .15 ? "missed-braking" : "steering-error");
        }
    }
    bool outside = car.frame.section.surface(s.d) == Surface::outside;
    bool aquaplane =
        water * car.spec.width * .14 * s.v > car.spec.water_flow * car.spec.compound_drain &&
        water > .7 && slip > .35 && s.v > 12;
    bool physical_error = outside || std::abs(s.heading) > 1.1 || m.lock > .38 || aquaplane;
    if (physical_error && !m.error_active) {
        event(b, car, tick,
              outside                     ? "off-track"
              : std::abs(s.heading) > 1.1 ? "spin"
              : aquaplane                 ? "aquaplaning"
                                          : "lockup");
        m.confidence = unit(m.confidence - .025);
    }
    m.error_active = physical_error;
}
struct Intent {
    Tactic mode;
    double desired;
    const Seen *opponent = nullptr;
};
Intent decide(const Vehicle &c, const Scene &scene, double base, double bend, Clock tick) {
    const auto &s = c.state;
    const auto &m = s.mind;
    const auto &p = c.spec.driver;
    const auto *f = scene.front, *r = scene.rear;
    double inside = bend < 0 ? -1. : 1.;
    if (s.command.flag == 2)
        return {Tactic::pit, base};
    if (s.command.flag == 1 || !m.formation_done)
        return {Tactic::formation, c.grid_offset};
    double edge = s.d > 0 ? c.frame.section.left - s.d : c.frame.section.right + s.d;
    if (std::abs(s.heading) > .7 || edge < c.spec.width * .35 ||
        c.frame.section.surface(s.d) == Surface::outside)
        return {Tactic::recover, 0};
    if (scene.beside) {
        auto &v = *scene.beside;
        double side = s.d >= v.d ? 1. : -1.;
        return {Tactic::alongside, side * std::max(side * s.d, side * v.d + v.half_width + .65),
                &v};
    }
    if (f && (f->speed < 2 || f->crossing) && f->ds < 20)
        return {Tactic::obstacle, f->d, &*f};
    if (m.jam)
        return {Tactic::recover, s.d};
    if (std::any_of(s.tyres.begin(), s.tyres.end(), [](auto &t) { return t.punctured; }))
        return {Tactic::damaged, base};
    if (!m.started)
        return {Tactic::launch, c.grid_offset};
    if (r && -r->ds < 12 + .35 * s.v && r->speed > s.v + 1 && (r->lapping || r->different_class))
        return {Tactic::yield, s.d, r};
    if (scene.target && !scene.target->crossing) {
        auto &v = *scene.target;
        if (v.ds < 0)
            return {Tactic::alongside, s.d, &v};
        if (!m.crossed && !m.switching && tick - m.attack_ticks > 35 &&
            m.side * (v.d - m.target_d) > .45 && std::abs(bend) > .002 && v.ds > v.half_length + 1)
            return {Tactic::crossover, v.d - m.side * (v.half_width + .85), &v};
        return {Tactic::attack, v.d + m.side * (v.half_width + .85), &v};
    }
    bool gained_on =
        f && f->ds - f->half_length < (2. + p.attack + p.risk) * std::max(0., s.v - f->speed) +
                                          (.4 + .8 * p.risk) * c.spec.length;
    if (f && gained_on && !f->crossing &&
        f->ds < 10 + (.28 + .27 * p.attack + .12 * p.risk) * s.v && tick >= m.retry_tick &&
        (s.v - f->speed > .45 ||
         (s.v > 10 && f->ds < 2.7 * f->half_length && std::abs(bend) > .003 &&
          p.risk + m.confidence > 1.) ||
         (m.rival == f->id && tick < m.rival_until)) &&
        s.distance > c.spec.length * 1.5) {
        return {m.rival == f->id && tick < m.rival_until ? Tactic::counter : Tactic::attack,
                f->d + inside * (f->half_width + .85), f};
    }
    if (r && !r->different_class && !r->lapping && r->ds > -(6 + s.v * (.10 + .32 * p.defence)) &&
        r->speed > s.v - .4 && s.distance > c.spec.length * 3)
        return {Tactic::defend, inside * (c.frame.section.left + c.frame.section.right) * .28, r};
    if (f && f->ds < 20 + .8 * s.v) {
        if ((s.coolant > 99 || (m.wake > .12 && std::abs(bend) * s.v * s.v > 5)) &&
            f->ds > f->half_length)
            return {Tactic::cool, f->d + (base >= f->d ? 1 : -1) * (f->half_width + 1.2), f};
        return {Tactic::pursue, std::abs(bend) * s.v * s.v < 3 ? f->d : base, f};
    }
    return {Tactic::clear, base};
}
// Sweep candidate corridors against constant-velocity observations. A car already
// alongside owns its strip. Score intermediate positions, not just the endpoint.
struct Path {
    double lane;
    bool fits;
};
Path corridor(const Vehicle &c, const std::vector<Seen> &objects, double desired, double lo,
              double hi, double horizon, bool passing, const Seen *opponent) {
    const auto &s = c.state;
    double best_score = 1e20;
    Path best{s.d, false};
    double side_accel = std::clamp(.36 * c.spec.mu * gravity - .08 * std::abs(s.ay), 1.5, 7.);
    for (int i = -2; i <= 12; ++i) {
        double target = i == -2   ? std::clamp(desired, lo, hi)
                        : i == -1 ? std::clamp(s.d, lo, hi)
                                  : std::lerp(lo, hi, i / 12.);
        double score = std::abs(target - desired) + .40 * std::abs(target - s.d) +
                       .38 * std::abs(target - s.mind.lane);
        double nearest = 1000;
        for (const auto &v : objects) {
            double clearance = 1000;
            for (double t : {.25, .55, .95, 1.45, horizon}) {
                double ds = v.ds + (v.speed - s.v) * t;
                double d = s.d + std::clamp(target - s.d, -.5 * side_accel * t * t,
                                            .5 * side_accel * t * t);
                double rival = v.d + std::clamp(v.drift * t, -.5, .5);
                if (std::abs(ds) < v.half_length + 1.0) {
                    double margin = std::abs(d - rival) - v.half_width;
                    clearance = std::min(clearance, margin);
                    score += 10 * std::max(0., .55 - margin);
                }
            }
            if (passing && &v == opponent) {
                double margin = std::abs(target - v.d) - v.half_width;
                clearance = std::min(clearance, margin);
                score += 14 * std::max(0., .65 - margin);
            }
            nearest = std::min(nearest, clearance);
        }
        if (score < best_score) {
            best_score = score;
            best = {target, nearest >= .05};
        }
    }
    return best;
}
// At walking speed, survey the actual free patch around a stranded vehicle.
// Trace short bicycle-model arcs against visible body envelopes. Reversing
// competes with holding position only when it improves access to the road.
void escape_route(const Vehicle &car, const Ribbon &road, const std::vector<Seen> &obs,
                  double &steer, double &speed) {
    const auto &s = car.state;
    auto here = pose(car.frame, s.heading);
    auto goal = road.frame(s.cursor.s + 2.5 * car.spec.length).point;
    double gx = goal.x - here.centre.x, gy = goal.y - here.centre.y;
    double norm = std::max(1., std::hypot(gx, gy));
    double best = -1e9;
    speed = 0;
    for (double direction : {1., -1.}) {
        for (double angle : {0., -.28, .28, -.56, .56}) {
            Pose point = here;
            double distance = 0;
            for (int i = 0; i < 8; ++i) {
                double step = .35 * direction;
                double turn = step * std::tan(angle) / car.spec.wheelbase;
                auto next = point;
                next.centre.x += step * std::cos(point.yaw + .5 * turn);
                next.centre.y += step * std::sin(point.yaw + .5 * turn);
                next.yaw += turn;
                Motion swept{point, next, car.spec.length, car.spec.width, car.spec.height};
                if (std::any_of(obs.begin(), obs.end(),
                                [&](const Seen &v) { return contact_time(swept, v.box) <= 1; }))
                    break;
                point = next;
                distance += .35;
            }
            if (distance < .7)
                continue;
            double progress =
                ((point.centre.x - here.centre.x) * gx + (point.centre.y - here.centre.y) * gy) /
                norm;
            double align = (std::cos(point.yaw) * gx + std::sin(point.yaw) * gy) / norm;
            double score = progress + 1.2 * align + .6 * distance - .15 * std::abs(angle) -
                           (direction < 0 ? 2. : 0.);
            if (score > best) {
                best = score;
                steer = angle;
                speed = direction * std::min(direction < 0 ? 1.2 : 3.2, distance * 1.25);
            }
        }
    }
}
} // namespace
void initialise_driver(Vehicle &c, const Conditions &env) {
    auto &m = c.state.mind;
    const auto &p = c.spec.driver;
    m.rng = 14695981039346656037ULL;
    for (unsigned char ch : p.id.empty() ? c.spec.id : p.id)
        m.rng = (m.rng ^ ch) * 1099511628211ULL;
    m.rng ^= env.seed;
    m.attention = .55 + .4 * p.consistency;
    double balance = c.spec.front_weight + .12 * (c.spec.antiroll - .5);
    double mismatch = std::abs(balance - (.38 + .18 * p.balance)) +
                      .12 * std::abs(c.spec.wing - (.85 + .3 * p.fast_bends));
    m.familiarity = unit(p.familiarity - mismatch * (1 - .45 * p.experience));
    m.confidence = p.confidence;
    m.fatigue = p.fatigue;
    m.lane = c.state.d;
    m.rolling = c.state.v > 0;
    m.roll_speed = c.state.v;
    m.started = !env.race_start;
    m.formation_done = !env.formation;
    m.green_tick = env.race_start ? 100 : 0;
    m.release_tick = m.green_tick + int(4 + 12 * (1 - p.launch) + 8 * draw(m));
    if (env.race_start && !m.rolling) {
        double clutch = draw(m);
        if (clutch < .025 * (1 - p.consistency) * p.risk)
            m.release_tick = m.green_tick - 5;
        m.stalled = clutch > 1 - .06 * (1 - p.launch) * (1 - m.familiarity);
    }
    m.launch_slip = (1 - p.launch) * draw(m);
}
void think(const Track &track, const Conditions &env, std::vector<Vehicle> &field, size_t index,
           Clock tick, Batch &b) {
    auto &car = field[index];
    auto &s = car.state;
    auto &m = s.mind;
    if (tick < m.next_scan)
        return;
    const auto &p = car.spec.driver;
    const auto &road = track.ribbon(Road::circuit);
    auto obs = observe(car, field, road.length(), env.water_mm);
    auto scene = assess(obs, car);
    if (scene.rear && -scene.rear->ds < scene.rear->half_length + 3 && scene.rear->speed > s.v) {
        m.rival = scene.rear->id;
        m.rival_until = tick + 180;
    }
    if (m.switching && scene.target && scene.target->ds > scene.target->half_length &&
        m.side * (s.d - scene.target->d) > .25) {
        m.switching = false;
        m.crossed = true;
        event(b, car, tick, "crossover", m.target);
    }
    double seconds = std::clamp(tick * dt - m.sense_time, dt, .4);
    m.sense_time = tick * dt;
    if (m.neutralised && s.command.flag == 0) {
        m.rolling = true;
        m.roll_speed = s.v;
        m.started = false;
        m.green_tick = tick;
        m.release_tick = tick + int(4 + 14 * (1 - p.launch));
        event(b, car, tick, "restart-signal");
    }
    m.neutralised = s.command.flag == 1;
    // Radio instructions are assimilated at the next scan; workload slows response.
    double response = unit(seconds * (2 + p.feedback + 2 * m.attention) / (1 + m.tension));
    m.radio_line += response * (s.command.preference - m.radio_line);
    m.radio_deploy += response * (s.command.deploy - m.radio_deploy);
    update_person(car, scene, seconds, env.water_mm, tick, b);
    m.next_scan = tick + 5 + int(5 * (1 - m.attention) + 2 * draw(m));
    if (!m.started && m.formation_done && tick >= m.release_tick) {
        if (m.stalled) {
            event(b, car, tick, "engine-stall");
            m.release_tick = tick + 45 + int(55 * (1 - p.pace));
            m.stalled = false;
        } else {
            m.started = true;
            m.launch_pending = true;
        }
    }
    if (m.started && s.v < 1 && s.fuel > 0 && s.command.flag == 0)
        m.blocked_ticks += std::lround(seconds / dt);
    else
        m.blocked_ticks = 0;
    if (m.blocked_ticks >= 150 && !m.jam) {
        m.jam = true;
        event(b, car, tick, "blocked");
    }
    if (m.jam && s.v > 2) {
        m.jam = false;
        event(b, car, tick, "recovered");
    }
    double horizon = 1.7 + .65 * p.judgement + .2 * m.confidence;
    double preview = std::max(car.spec.wheelbase * 2, s.v * .4);
    double bend = lookup(car, car.profile.curvature, preview);
    double base = lookup(car, car.profile.offset, preview);
    auto future = road.frame(s.cursor.s + preview);
    double reserve = car.spec.width * .5 + .25 + .35 * (1 - p.kerb);
    double lo = -std::min(car.frame.section.right, future.section.right) + reserve;
    double hi = std::min(car.frame.section.left, future.section.left) - reserve;
    if (lo > hi)
        lo = hi = (lo + hi) * .5;
    if (!m.target.empty() && (!scene.target || tick - m.attack_ticks > 450 ||
                              scene.target->ds > 22 + .7 * s.v || s.command.flag != 0)) {
        abort_attack(car, tick, b);
        scene.target = nullptr;
    }
    Intent intent = decide(car, scene, base, bend, tick);
    if (intent.mode == Tactic::pit) {
        auto entry = road.frame(track.entry());
        auto pit = track.ribbon(Road::pit).frame(2).point;
        bool left = (pit.x - entry.point.x) * (-entry.forward.y) +
                        (pit.y - entry.point.y) * entry.forward.x >
                    0;
        intent.desired = left ? hi : lo;
    }
    if (intent.mode == Tactic::defend) {
        if (m.defended != intent.opponent->id) {
            m.defended = intent.opponent->id;
            m.defence_line = intent.desired;
        }
        intent.desired = m.defence_line;
    } else if (!scene.rear || scene.rear->id != m.defended || scene.rear->ds < -30)
        m.defended.clear();
    bool passing = intent.mode == Tactic::attack || intent.mode == Tactic::counter ||
                   intent.mode == Tactic::crossover || intent.mode == Tactic::obstacle;
    // In a compressed group preserve the column through the bend. The next
    // car needs sufficient room to unwind its steering before a third car joins.
    unsigned close = 0;
    for (const auto &o : obs)
        if (std::abs(o.ds) < car.spec.length * 2 + .65 * s.v)
            ++close;
    bool queue = close >= 3 && (car.spec.kart || std::abs(bend) * s.v * s.v > 2);
    if (queue && !scene.beside && intent.mode != Tactic::recover &&
        intent.mode != Tactic::obstacle && intent.mode != Tactic::formation &&
        intent.mode != Tactic::pit && intent.mode != Tactic::launch) {
        abort_attack(car, tick, b);
        intent = {Tactic::pursue, std::clamp(s.d, lo, hi), scene.front};
        passing = false;
    }
    auto path = corridor(car, obs, intent.desired, lo, hi, horizon, passing, intent.opponent);
    if (passing && intent.opponent && !path.fits && intent.mode != Tactic::obstacle) {
        abort_attack(car, tick, b);
        intent.mode = Tactic::pursue;
        path = corridor(car, obs, s.d, lo, hi, horizon, false, nullptr);
    } else if (passing && intent.mode != Tactic::obstacle && m.target.empty()) {
        m.target = intent.opponent->id;
        m.crossed = false;
        m.switching = false;
        m.attack_ticks = tick;
        m.target_d = intent.opponent->d;
        m.side = path.lane > intent.opponent->d ? 1. : -1.;
        event(b, car, tick, intent.mode == Tactic::counter ? "counterattack" : "attack", m.target);
    }
    if (intent.mode == Tactic::crossover && path.fits &&
        m.side * (path.lane - intent.opponent->d) < 0) {
        m.side = path.lane > intent.opponent->d ? 1. : -1.;
        m.target_d = intent.opponent->d;
        m.switching = true;
    }
    if (intent.mode == Tactic::defend && m.tactic != int(Tactic::defend))
        event(b, car, tick, "defence", intent.opponent->id);

    double care = 0;
    for (const auto &t : s.tyres)
        care = std::max(care,
                        unit((t.surface - car.spec.high_c) / 25) + .5 * unit((t.wear - .45) * 3));
    care = unit(care) * (.4 + .35 * p.tyres + .25 * p.care);
    if (intent.mode == Tactic::clear && (care > .3 || s.fuel < 1))
        intent.mode = Tactic::conserve;
    bool solo = intent.mode == Tactic::clear || intent.mode == Tactic::conserve ||
                (intent.mode == Tactic::damaged && obs.empty());
    m.tactic = int(intent.mode);
    // Limit lane change rate even when the cost minimum changes sides.
    double max_change = seconds * (car.spec.kart ? 2.2 : 3.8) * (1.3 - .45 * p.smooth);
    m.lane += std::clamp(path.lane - m.lane, -max_change, max_change);
    if (solo)
        m.lane = s.d;
    m.blend = solo ? 0 : 1;
    m.speed_limit = 150;
    if (!solo || intent.mode == Tactic::damaged || care > .35) {
        // Braking envelope along the chosen offset, sampled over a local horizon.
        // For a parallel arc k_d=k/(1-k*d). Use the conservative envelope at
        // both the current and planned offset while crossing between them.
        double mass = car.spec.dry_mass + car.spec.driver_mass + s.fuel;
        double mu = (car.profile.grip_bin + .3) / 10. * (.78 + .16 * m.grip_estimate);
        double heat_budget = 1 - .35 * care;
        if (intent.mode == Tactic::damaged)
            heat_budget = std::min(heat_budget, .42);
        for (int i = 0; i <= 8; ++i) {
            double ds = (s.v * horizon + car.spec.length) * i / 8;
            auto f = road.frame(s.cursor.s + ds);
            double k = f.curvature;
            double factor = std::max(.35, std::min(1 - k * s.d, 1 - k * path.lane));
            double turn = std::abs(k) / factor;
            auto aero = aerodynamics(car.spec, s.v, m.wake, false, f.section.roughness);
            double lateral = mu * (gravity + aero.lift / mass) * heat_budget;
            // Off the proposed line a driver must reserve tyre force for correcting it.
            if (std::abs(s.d - base) > car.spec.width * .6 || close >= 2)
                lateral *= .79;
            double apex2 = lateral / std::max(.0001, turn);
            m.speed_limit = std::min(m.speed_limit, std::sqrt(apex2 + 2 * ds * mu * gravity * .65));
        }
    }
    if (intent.mode == Tactic::damaged) {
        unsigned failed =
            std::count_if(s.tyres.begin(), s.tyres.end(), [](auto &t) { return t.punctured; });
        m.speed_limit = std::min(m.speed_limit, 25. / std::sqrt(double(failed)));
    }
    if (intent.mode == Tactic::recover)
        m.speed_limit = std::min(m.speed_limit, std::abs(s.heading) > .7 ? 5. : 10.);
    if (intent.mode == Tactic::pit)
        m.speed_limit = std::min(
            40., std::sqrt(15 * 15 + 8 * std::fmod(track.entry() - s.cursor.s + road.length(),
                                                   road.length())));
    if (intent.mode == Tactic::formation) {
        m.speed_limit = car.spec.kart ? 10 : 20;
        if (!m.formation_done && !m.rolling) {
            double remaining = (1 - s.cursor.lap) * road.length() + car.grid_station - s.cursor.s;
            m.speed_limit = std::min(m.speed_limit, std::sqrt(3 * std::max(0., remaining - .2)));
        }
    }
    if (m.jam && s.command.flag == 0)
        escape_route(car, road, obs, m.crawl_steer, m.crawl_speed);
    else
        m.crawl_speed = 0;
    if (!m.started && m.formation_done)
        m.speed_limit = m.rolling ? m.roll_speed : 0;
    m.gap = 1000;
    m.lead_v = 0;
    for (const auto &v : obs) {
        if (v.ds <= 0)
            continue;
        double half = v.half_width + .35;
        double intended = solo ? base : path.lane;
        double relative_d = s.d - v.d;
        double predicted =
            relative_d +
            std::clamp((s.v * std::sin(s.heading) + s.lateral_v - v.drift) * .45, -1.5, 1.5);
        bool overlap = relative_d * predicted <= 0 ||
                       std::min(std::abs(relative_d), std::abs(predicted)) < half;
        // Anticipate a merge before moving across an occupied lane.
        bool cut_across =
            relative_d * (intended - v.d) <= 0 && std::abs(v.ds) < v.half_length + 1.1 * s.v;
        bool file =
            queue && v.ds > v.half_length && v.speed > 2 && v.ds < 2 * v.half_length + .6 * s.v;
        if (!overlap && !cut_across && !file && std::abs(intended - v.d) >= half)
            continue;
        if (v.ds - v.half_length < m.gap) {
            m.gap = v.ds - v.half_length;
            m.lead_v = v.speed;
        }
    }
    m.brake_preview =
        std::max(0., .10 + .16 * (1 - p.braking) + .12 * (1 - p.trail) + .25 * care +
                         .15 * (1 - m.grip_estimate) - (passing ? .09 * p.attack : 0) - m.miss);
    m.pedal_limit = 1 - care * .40;
    if (s.fuel < .5 + 1.5 * p.fuel_use && !passing)
        m.pedal_limit = std::min(m.pedal_limit, .72);
    m.deploy = (passing || intent.mode == Tactic::defend)
                   ? 1
                   : (s.energy < car.spec.battery_kj * .28 ? .28 : .8);
    m.deploy = std::min(m.deploy, m.radio_deploy);
    if (s.command.flag || !m.started)
        m.deploy = 0;
}
void finish_attack(Vehicle &car, const std::vector<Vehicle> &field, double len, Clock tick,
                   Batch &b) {
    auto &m = car.state.mind;
    if (m.target.empty())
        return;
    auto it = std::lower_bound(field.begin(), field.end(), m.target,
                               [](auto &v, const auto &id) { return v.spec.id < id; });
    if (it == field.end() || it->spec.id != m.target)
        return;
    // A signed local separation is continuous over the timing line during a duel.
    double ahead = std::remainder(car.state.cursor.s - it->state.cursor.s, len);
    if (ahead <= .5 * (longitudinal(car) + longitudinal(*it)) + .25)
        return;
    event(b, car, tick, "attack-completed", m.target);

    m.target.clear();
    m.confidence = unit(m.confidence + .04 * (.5 + car.spec.driver.ambition));
}
} // namespace race
