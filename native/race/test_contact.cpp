#include "contact.hpp"
#include <cmath>
#include <numbers>
#include <stdexcept>

using namespace race;
namespace {
void check(bool ok, const char *msg) {
    if (!ok)
        throw std::runtime_error(msg);
}
Motion box(double x0, double y0, double x1, double y1, double yaw = 0) {
    return {{{x0, y0, 0}, yaw}, {{x1, y1, 0}, yaw}, 4, 2, 1};
}
} // namespace
int main() {
    auto a = box(-20, 0, 20, 0), b = box(0, 0, 0, 0);
    check(std::abs(contact_time(a, b) - .4) < 1e-7, "head-on tunnelling");
    check(contact_time(a, box(0, 2.001, 0, 2.001)) > 1, "separate parallel lanes");
    auto crossing = box(0, -20, 0, 20, std::numbers::pi / 2);
    check(contact_time(a, crossing) < .5, "perpendicular crossing");
    crossing.from.centre.z = crossing.to.centre.z = 3.;
    check(contact_time(a, crossing) > 1, "bridge height");
    auto rotating = box(0, 0, 0, 0);
    rotating.length = 8;
    rotating.width = .8;
    rotating.to.yaw = std::numbers::pi;
    auto post = box(0, 3.6, 0, 3.6);
    post.length = post.width = .5;
    check(contact_time(rotating, post) < .5, "rotational sweep with clear endpoints");
    // A narrow notch between two wide cross-sections catches the side of a car
    // although its centre and all four corners are on asphalt.
    auto station = [](double x, double y, double left) {
        return Station{{x, y, 0}, left, 5, 0, 0, 0, 0, 0, 0};
    };
    std::vector<Station> loop = {station(0, 0, 5),     station(20, 0, 5),   station(20.05, 0, .7),
                                 station(20.10, 0, 5), station(50, 0, 5),   station(60, 20, 5),
                                 station(50, 40, 5),   station(-10, 40, 5), station(-20, 10, 5)};
    Ribbon road(loop, true);
    double s = road.project({20.05, 0, 0})[0];
    Body body{"car", {Road::circuit, s - 1.2, 0}, .1, 4., 2., 1., 0.};
    check(!road.contains_footprint(body), "full body straddles narrow notch");
    body.offset = -1;
    check(road.contains_footprint(body), "legal asymmetric grid slot");
}
