#include "space.hpp"
#include <cmath>
#include <iostream>
#include <numbers>
#include <stdexcept>

using namespace race;
namespace {
void check(bool condition, const char *detail) {
    if (!condition)
        throw std::runtime_error(detail);
}
void near(double a, double b, double tolerance) {
    check(std::abs(a - b) < tolerance, "numeric tolerance");
}
Station at(double x, double y, double z) { return {{x, y, z}, 7, 6, .02, .001, 1.2, .8, 4, 3}; }
} // namespace

int main() {
    constexpr auto pi = std::numbers::pi;
    std::vector<Station> circle;
    for (int i = 0; i < 96; ++i) {
        double t = 2 * pi * i / 96;
        circle.push_back(at(100 * std::cos(t), 100 * std::sin(t), 3 * std::sin(t)));
    }
    Track track(circle, {at(92, -37, -1), at(93, 0, 0), at(92, 37, 1)}, .90, .10, .5);
    const auto &road = track.ribbon(Road::circuit);
    const auto &pit = track.ribbon(Road::pit);
    const double length = road.length();
    near(length, 200 * pi, .03);
    near(road.frame(0).curvature, .01, .0001);
    near(road.frame(0, 2).point.x, 98, .001);
    near(road.frame(0, 2).point.z, .04, .0001);
    near(road.frame(0).grade, .03, .0001);
    check(road.surface(0, -6.3) == Surface::kerb && road.surface(0, 9) == Surface::runoff,
          "surface bands");
    for (auto [s, t] : {std::pair{track.entry(), 0.}, std::pair{track.exit(), pit.length()}}) {
        for (double offset : {-1., 0., 1.}) {
            auto a = road.frame(s, offset), b = pit.frame(t, offset);
            near(a.point.x, b.point.x, 1e-9);
            near(a.point.y, b.point.y, 1e-9);
            near(a.point.z, b.point.z, 1e-9);
            near(a.forward.x, b.forward.x, 1e-9);
            near(a.forward.y, b.forward.y, 1e-9);
        }
    }
    Cursor before{Road::circuit, track.entry() - 1, 3};
    auto inside = track.advance(before, 1 + track.pit_timing() + .1, true);
    check(inside.road == Road::pit && inside.lap == 4, "pit timing");
    auto end = track.advance(inside, pit.length() - inside.s + 12, false);
    near(end.s, track.exit() + 12, 1e-9);
    check(end.lap == 4, "double counted lap in pit");
    auto direct = track.advance(before, 1 + pit.length() + 12, true);
    near(end.s, direct.s, 1e-8);
    auto a = track.advance({Road::circuit, length - 1, 0}, 3 * length + 2, false);
    near(a.s, 1, 1e-8);
    check(a.lap == 4, "multi-lap advance");
    Lines lines(track, 2, .3, 12);
    for (double s = 0; s < length; s += 1.15) {
        double left = lines.offset(s, 1), right = lines.offset(s, -1);
        check(left <= 6 && right >= -5 && left > right, "line envelope");
        auto p = road.frame(s, 2);
        auto proj = road.project(p.point);
        near(proj[0], s, .05);
        near(proj[1], 2, .001);
        Body car{"a", {Road::circuit, s, 42}, -2, 5, 2, 1, 0}, other = car;
        other.id = "b";
        other.offset = 2;
        check(track.overlaps({car, other}).empty(), "parallel cars");
        other.offset = -1;
        check(track.overlaps({other, car}) == track.overlaps({car, other}) &&
                  track.overlaps({car, other}).size() == 1,
              "stable overlap");
    }
    std::cout << "periodic frame, projection, width, pit transport and parallel movement passed\n";
}
