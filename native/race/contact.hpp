#pragma once
#include "space.hpp"

namespace race {
struct Pose {
    Vec centre;
    double yaw;
};
struct Motion {
    Pose from, to;
    double length, width, height;
};
Pose pose(const Frame &frame, double heading);
Pose pose(const Ribbon &road, double s, double offset, double heading);
Pose interpolate(Pose from, Pose to, double t);
// First time in [0,1] for the swept oriented boxes, or >1 for no contact.
Vec contact_normal(const Motion &a, const Motion &b, double t);
double contact_time(const Motion &a, const Motion &b);
} // namespace race
