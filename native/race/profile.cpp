#include "dynamics.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>

namespace race {
namespace {
double interp(const std::vector<double> &v, double u) {
    auto i = static_cast<size_t>(u) % v.size();
    return std::lerp(v[i], v[(i + 1) % v.size()], u - std::floor(u));
}
void geometry(const Track &track, Vehicle &car) {
    const auto &p = car.spec;
    auto &profile = car.profile;
    const auto &road = track.ribbon(Road::circuit);
    const size_t n = std::max<size_t>(32, std::ceil(road.length() / (p.kart ? 2.5 : 5.)));
    profile.step = road.length() / n;
    Lines lines(track, p.width, .35, std::clamp(3 * p.wheelbase + .012 * p.power_kw, 4., 26.));
    // Relax the seed towards the road axis. Score entire closed laps to let
    // entry/exit speed across linked corners influence the selected line.
    for (double scale : {.35, .68, 1.}) {
        std::vector<Frame> frames;
        std::vector<LinePoint> path(n);
        for (size_t i = 0; i < n; ++i) {
            path[i].d = scale * lines.offset(i * profile.step, 0);
            frames.push_back(road.frame(i * profile.step, path[i].d));
        }
        for (size_t i = 0; i < n; ++i) {
            auto a = frames[(i + n - 1) % n].point, b = frames[i].point,
                 c = frames[(i + 1) % n].point;
            double ux = b.x - a.x, uy = b.y - a.y, vx = c.x - b.x, vy = c.y - b.y;
            auto &pt = path[i];
            pt.ds = std::max(.01, std::hypot(vx, vy));
            pt.curvature =
                2 * (ux * vy - uy * vx) /
                std::max(.001, std::hypot(ux, uy) * pt.ds * std::hypot(c.x - a.x, c.y - a.y));
            pt.grade = (c.z - b.z) / pt.ds;
            pt.crossfall = frames[i].section.crossfall;
            pt.roughness = frames[i].section.roughness;
        }
        profile.candidates.push_back(std::move(path));
    }
}
} // namespace
void plan(const Track &track, Vehicle &car, const Conditions &env, int saved_grip, int saved_mass) {
    auto &profile = car.profile;
    const auto &p = car.spec;
    const auto &s = car.state;
    double mu = 0, mass = p.dry_mass + p.driver_mass + s.fuel;
    for (size_t i = 0; i < s.tyres.size(); ++i)
        mu += .25 * tyre_mu(p, s.tyres[i], mass * gravity / 4, pressure_kpa(p, s.tyres[i], i),
                            env.water_mm, 30.);
    int grip_bin = std::clamp(int(std::floor(mu * 10)), 1, 35);
    int mass_bin = int(std::floor(mass / 10));
    if (saved_grip >= 0) {
        grip_bin = saved_grip;
        mass_bin = saved_mass;
    }
    if (grip_bin == profile.grip_bin && mass_bin == profile.mass_bin)
        return;
    profile.grip_bin = grip_bin;
    profile.mass_bin = mass_bin;
    mu = (grip_bin + .3) / 10.;
    mass = (mass_bin + .5) * 10.;
    if (profile.candidates.empty())
        geometry(track, car);
    double best = std::numeric_limits<double>::infinity();
    for (const auto &path : profile.candidates) {
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
                double capacity = mu * (gravity + aero.lift / mass);
                double lateral = std::abs(pt.curvature) * speed * speed;
                double brake =
                    std::min(p.brake_nm / p.radius / mass,
                             std::sqrt(std::max(0., capacity * capacity - lateral * lateral)));
                v[j] = std::min(v[j], std::sqrt(std::max(
                                          1., speed * speed + 2 * pt.ds *
                                                                  (.8 * brake + aero.drag / mass +
                                                                   gravity * pt.grade))));
            }
            for (size_t j = 0; j < n; ++j) {
                auto next = (j + 1) % n;
                auto aero = aerodynamics(p, v[j], 0, false, path[j].roughness);
                double drive =
                    std::min(.62 * mu * (gravity + aero.lift / mass),
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
            for (size_t i = 0; i < n; ++i)
                profile.offset[i] = path[i].d;
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
    double ahead = std::fmod(s.cursor.s + look, road.length());
    auto destination = road.frame(ahead);
    double offset = interp(profile.offset, ahead / profile.step);
    double edge = input.preference > 0 ? destination.section.left - p.width / 2 - .25
                                       : -destination.section.right + p.width / 2 + .25;
    offset = std::lerp(offset, edge, std::abs(input.preference));
    double blend = std::min(1., s.distance / (p.kart ? 60. : 8 * p.length));
    offset = std::lerp(car.grid_offset, offset, blend * blend * (3 - 2 * blend));
    offset = std::clamp(offset, -destination.section.right + p.width / 2,
                        destination.section.left - p.width / 2);
    auto target = road.frame(ahead, offset).point;
    auto here = pose(road, s.cursor.s, s.d, s.heading);
    double dx = target.x - here.centre.x, dy = target.y - here.centre.y;
    double curvature =
        2 * (-std::sin(here.yaw) * dx + std::cos(here.yaw) * dy) / std::max(.2, dx * dx + dy * dy);
    input.steer = std::clamp(std::atan(p.wheelbase * curvature), -.6, .6);
    double goal =
        interp(profile.speed, std::fmod(s.cursor.s + .12 * s.v, road.length()) / profile.step);
    // Basic actuator following-distance guard. No tactical line selection.
    if (gap < 100) {
        // Both cars can brake. Keep a reaction distance plus the difference
        // of stopping distances, including at rolling-grid speed.
        const double decel = std::min(p.brake_nm / p.radius / (p.dry_mass + p.driver_mass + s.fuel),
                                      p.mu * gravity * (p.kart ? .42 : .70));
        double launch = std::clamp(s.distance / (30 * p.length), 0., 1.);
        double headway = p.kart ? std::lerp(.10, .82, launch) : std::lerp(.24, .62, launch);
        double reaction = decel * headway;
        double clear = p.kart ? .22 : .72;
        double safe = std::sqrt(std::max(0., reaction * reaction + leader_v * leader_v +
                                                 2 * decel * (gap - clear))) -
                      reaction;
        goal = std::min(goal, std::max(0., safe));
    }
    input.throttle = std::clamp((goal - s.v) * .8, 0., 1.);
    input.brake = std::clamp((s.v - goal) * .36, 0., 1.);
    return input;
}
} // namespace race
