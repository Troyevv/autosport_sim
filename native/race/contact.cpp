#include "contact.hpp"
#include <algorithm>
#include <cmath>
#include <numbers>

namespace race {
namespace {
double turn(double delta) { return std::remainder(delta, 2 * std::numbers::pi); }

double extent(const Motion &m, double yaw, double axis) {
    return (m.length * std::abs(std::cos(yaw - axis)) + m.width * std::abs(std::sin(yaw - axis))) /
           2;
}
} // namespace
Pose pose(const Ribbon &road, double s, double offset, double heading) {
    return pose(road.frame(s, offset), heading);
}
Pose pose(const Frame &f, double heading) {
    return {f.point, std::atan2(f.forward.y, f.forward.x) + heading};
}
Pose interpolate(Pose a, Pose b, double t) {
    return {{std::lerp(a.centre.x, b.centre.x, t), std::lerp(a.centre.y, b.centre.y, t),
             std::lerp(a.centre.z, b.centre.z, t)},
            a.yaw + t * turn(b.yaw - a.yaw)};
}
Vec contact_normal(const Motion &a, const Motion &b, double t) {
    auto p = interpolate(a.from, a.to, t), q = interpolate(b.from, b.to, t);
    double best = -1e20;
    Vec normal{};
    for (double axis : {p.yaw, q.yaw, p.yaw + std::numbers::pi / 2, q.yaw + std::numbers::pi / 2}) {
        Vec n{std::cos(axis), std::sin(axis), 0};
        double projection = (q.centre.x - p.centre.x) * n.x + (q.centre.y - p.centre.y) * n.y;
        double gap = std::abs(projection) - extent(a, p.yaw, axis) - extent(b, q.yaw, axis);
        if (gap > best) {
            best = gap;
            double sign = projection >= 0 ? 1. : -1.;
            normal = {n.x * sign, n.y * sign, 0};
        }
    }
    return normal;
}
double contact_time(const Motion &a, const Motion &b) {
    const auto &p = a.from.centre, &q = b.from.centre;
    const double dx = (a.to.centre.x - p.x) - (b.to.centre.x - q.x);
    const double dy = (a.to.centre.y - p.y) - (b.to.centre.y - q.y);
    const double ra = std::hypot(a.length, a.width) / 2, rb = std::hypot(b.length, b.width) / 2;
    if (std::abs(p.x - q.x) > ra + rb + std::abs(dx) ||
        std::abs(p.y - q.y) > ra + rb + std::abs(dy))
        return 2;
    const double rotation =
        ra * std::abs(turn(a.to.yaw - a.from.yaw)) + rb * std::abs(turn(b.to.yaw - b.from.yaw));
    const double dz = (a.to.centre.z - p.z) - (b.to.centre.z - q.z);
    double t = 0;
    for (int iteration = 0; iteration < 128; ++iteration) {
        const auto u = interpolate(a.from, a.to, t), v = interpolate(b.from, b.to, t);
        double safe = 0, nearest = -1e100, nearest_closing = 0;
        auto certificate = [&](double separation, double closing) {
            if (separation > nearest) {
                nearest = separation;
                nearest_closing = closing;
            }
            if (separation > 1e-7)
                safe = std::max(safe, closing > 0 ? separation / closing : 2.);
        };
        certificate(v.centre.z - u.centre.z - a.height, dz);
        certificate(u.centre.z - v.centre.z - b.height, -dz);
        for (double axis :
             {u.yaw, v.yaw, u.yaw + std::numbers::pi / 2, v.yaw + std::numbers::pi / 2}) {
            double nx = std::cos(axis), ny = std::sin(axis);
            double projection = (v.centre.x - u.centre.x) * nx + (v.centre.y - u.centre.y) * ny;
            double separation =
                std::abs(projection) - extent(a, u.yaw, axis) - extent(b, v.yaw, axis);
            // Keep this axis fixed until its gap could close. Translation
            // parallel to a separating edge consumes no lateral clearance.
            certificate(separation, (projection < 0 ? -1 : 1) * (dx * nx + dy * ny) + rotation);
        }
        if (t == 0 && nearest <= 1e-7 && nearest_closing <= 1e-12)
            return 2; // Initially touching/penetrating: this supporting plane only separates.
        if (safe == 0)
            return t;
        if (safe > 1 - t)
            return 2;
        t += safe;
    }
    return t; // Conservative for grazing, nearly parallel edges.
}
} // namespace race
