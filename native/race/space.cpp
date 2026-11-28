#include "space.hpp"

#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
#include <set>
#include <stdexcept>
#include <tuple>

namespace race {
namespace {
void require(bool condition, const char *msg) {
    if (!condition)
        throw std::invalid_argument(msg);
}
Vec operator+(Vec a, Vec b) { return {a.x + b.x, a.y + b.y, a.z + b.z}; }
Vec operator-(Vec a, Vec b) { return {a.x - b.x, a.y - b.y, a.z - b.z}; }
Vec operator*(Vec a, double b) { return {a.x * b, a.y * b, a.z * b}; }
double dot(Vec a, Vec b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
double planar(Vec a) { return std::hypot(a.x, a.y); }
Vec unit(Vec a) {
    const double n = planar(a);
    require(n > 1e-9, "degenerate planar tangent");
    return a * (1 / n);
}
Vec normal(Vec a) { return {-a.y, a.x, 0}; }
bool finite(Vec v) { return std::isfinite(v.x) && std::isfinite(v.y) && std::isfinite(v.z); }
double wrap(double s, double length) {
    double v = std::fmod(s, length);
    return v < 0 ? v + length : v;
}
Station mix(const Station &a, const Station &b, double t) {
    return {a.point + (b.point - a.point) * t,
            std::lerp(a.left, b.left, t),
            std::lerp(a.right, b.right, t),
            std::lerp(a.crossfall, b.crossfall, t),
            std::lerp(a.roughness, b.roughness, t),
            std::lerp(a.kerb_left, b.kerb_left, t),
            std::lerp(a.kerb_right, b.kerb_right, t),
            std::lerp(a.runoff_left, b.runoff_left, t),
            std::lerp(a.runoff_right, b.runoff_right, t)};
}
void validate(const Station &a) {
    require(finite(a.point) &&
                std::max({std::abs(a.point.x), std::abs(a.point.y), std::abs(a.point.z)}) < 1e6,
            "invalid local coordinates");
    require(a.left > 0 && a.left < 200 && a.right > 0 && a.right < 200 && std::abs(a.crossfall) < 1,
            "invalid cross section");
    for (double x : {a.roughness, a.kerb_left, a.kerb_right, a.runoff_left, a.runoff_right})
        require(x >= 0 && x < 1000, "invalid surface extent");
}
} // namespace

Ribbon::Ribbon(std::vector<Station> p, bool closed, Vec entry, Vec exit) : closed_(closed) {
    require(p.size() >= 3 && p.size() <= 100000, "invalid number of survey stations");
    for (const auto &a : p)
        validate(a);
    const size_t n = p.size(), segments = closed ? n : n - 1;
    std::vector<Vec> tangents(n);
    for (size_t i = 0; i < n; ++i) {
        if (!closed && i == 0)
            tangents[i] = unit(entry);
        else if (!closed && i + 1 == n)
            tangents[i] = unit(exit);
        else {
            Vec prev = unit(p[i].point - p[(i + n - 1) % n].point);
            Vec next = unit(p[(i + 1) % n].point - p[i].point);
            tangents[i] = unit(prev + next);
        }
    }
    // Arc-length table over piecewise cubic Hermite spans. Shared endpoint tangents
    // also define the frame at both junctions. Keep the tessellation below 2 m.
    for (size_t i = 0; i < segments; ++i) {
        const size_t j = (i + 1) % n;
        Vec delta = p[j].point - p[i].point;
        double span = planar(delta);
        require(span > 0.01 && span < 5000, "invalid survey span");
        const int count = std::max(2, static_cast<int>(std::ceil(span / 2)));
        require(nodes_.size() + count < 250000, "ribbon exceeds station budget");
        Vec a = tangents[i] * span, b = tangents[j] * span;
        Vec c = delta * 3 - a * 2 - b, d = a + b - delta * 2;
        for (int k = 0; k < count; ++k) {
            double t = double(k) / count;
            Station section = mix(p[i], p[j], t);
            section.point = p[i].point + (a + (c + d * t) * t) * t;
            Vec v = a + (c * 2 + d * (3 * t)) * t, acc = c * 2 + d * (6 * t);
            double speed = planar(v);
            nodes_.push_back(
                {section, unit(v), (v.x * acc.y - v.y * acc.x) / (speed * speed * speed)});
        }
    }
    if (closed)
        nodes_.push_back(nodes_.front());
    else
        nodes_.push_back({p.back(), tangents.back(), nodes_.back().curvature});
    distances_.push_back(0);
    for (size_t i = 1; i < nodes_.size(); ++i) {
        double ds = planar(nodes_[i].station.point - nodes_[i - 1].station.point);
        require(ds > 1e-8, "degenerate curve segment");
        distances_.push_back(distances_.back() + ds);
    }
    order_.resize(nodes_.size() - 1);
    std::iota(order_.begin(), order_.end(), 0);
    build_box(0, order_.size());
}

Frame Ribbon::frame(double s, double offset) const {
    require(std::isfinite(s) && std::isfinite(offset), "non-finite track coordinate");
    if (closed_)
        s = wrap(s, length());
    else
        require(s >= 0 && s <= length(), "pit coordinate outside branch");
    size_t i =
        std::min(nodes_.size() - 2,
                 static_cast<size_t>(std::upper_bound(distances_.begin(), distances_.end(), s) -
                                     distances_.begin() - 1));
    double t = (s - distances_[i]) / (distances_[i + 1] - distances_[i]);
    const auto &a = nodes_[i];
    const auto &b = nodes_[i + 1];
    Station section = mix(a.station, b.station, t);
    Vec direction = unit(a.tangent + (b.tangent - a.tangent) * t);
    Vec point = section.point + normal(direction) * offset;
    point.z += section.crossfall * offset;
    return {point, direction, std::lerp(a.curvature, b.curvature, t), direction.z, section};
}
bool Ribbon::contains_footprint(const Body &body) const {
    require(closed_ && body.position.s >= 0 && body.position.s < length() &&
                std::abs(body.offset) < 200,
            "invalid grid coordinate");
    const auto origin = frame(body.position.s, body.offset);
    if (origin.section.surface(body.offset) != Surface::asphalt)
        return false;
    Vec axis = origin.forward * std::cos(body.heading_delta) +
               normal(origin.forward) * std::sin(body.heading_delta);
    axis.z = 0;
    Vec side = normal(axis);
    // A box containing an interior point is inside this strip iff neither edge
    // enters the box. Follow this branch only (a bridge can cross the grid).
    const double reach = 4 * (body.length + body.width + std::abs(body.offset)) + 5;
    auto cap = [&](int sign) {
        // Stop at the first transversal beyond the whole box. A second arm
        // of a hairpin may pass through its XY bounding box farther along s.
        for (double ds = .5; ds <= reach; ds += .5) {
            auto f = frame(body.position.s + sign * ds);
            Vec t{f.forward.x, f.forward.y, 0};
            double r =
                .5 * (body.length * std::abs(dot(axis, t)) + body.width * std::abs(dot(side, t)));
            if (sign * dot(f.point - origin.point, t) > r + .002)
                return body.position.s + sign * ds;
        }
        return body.position.s + sign * reach;
    };
    double begin = cap(-1), end = cap(1);
    auto boundary = [&](const Frame &f, int sign) {
        return f.point + normal(f.forward) * (sign > 0 ? f.section.left : -f.section.right);
    };
    auto intersects = [&](Vec a, Vec b, double pad) {
        double lo = 0, hi = 1;
        for (auto [n, half] :
             {std::pair{axis, body.length * .5}, std::pair{side, body.width * .5}}) {
            double start = dot(a - origin.point, n), delta = dot(b - a, n);
            if (std::abs(delta) < 1e-12) {
                if (std::abs(start) > half + pad)
                    return false;
            } else {
                double t0 = (-half - pad - start) / delta, t1 = (half + pad - start) / delta;
                lo = std::max(lo, std::min(t0, t1));
                hi = std::min(hi, std::max(t0, t1));
                if (lo > hi)
                    return false;
            }
        }
        return true;
    };
    // The centre and width are affine on each tessellation segment. The
    // normal turns monotonically between its ends. Bound its deviation from
    // the boundary chord by width times the full change in unit normal.
    auto touches = [&](auto &&self, double s0, double s1, const Frame &a, const Frame &b,
                       int sign) -> bool {
        double width = sign > 0 ? std::max(a.section.left, b.section.left)
                                : std::max(a.section.right, b.section.right);
        double error = width * std::hypot(a.forward.x - b.forward.x, a.forward.y - b.forward.y);
        if (!intersects(boundary(a, sign), boundary(b, sign), error + .001))
            return false;
        if (error < .001 || s1 - s0 < .001)
            return true;
        double mid = (s0 + s1) * .5;
        auto f = frame(mid);
        return self(self, s0, mid, a, f, sign) || self(self, mid, s1, f, b, sign);
    };
    // Iterate the original knots in unwrapped order, including the finish seam.
    for (int lap = static_cast<int>(std::floor(begin / length()));
         lap <= std::floor(end / length()); ++lap) {
        double base = lap * length();
        double a = std::max(0., begin - base), b = std::min(length(), end - base);
        auto it = std::upper_bound(distances_.begin(), distances_.end(), a);
        Frame f = frame(a);
        while (a < b && it != distances_.end()) {
            double next = std::min(*it++, b);
            Frame g = frame(next);
            if (touches(touches, a, next, f, g, -1) || touches(touches, a, next, f, g, 1))
                return false;
            a = next;
            f = g;
        }
    }
    return true;
}

Surface Ribbon::surface(double s, double offset) const {
    return frame(s, offset).section.surface(offset);
}

Surface Station::surface(double offset) const {
    double edge = offset >= 0 ? left : right;
    double beyond = std::abs(offset) - edge;
    if (beyond <= 0)
        return Surface::asphalt;
    double kerb = offset >= 0 ? kerb_left : kerb_right;
    if (beyond <= kerb)
        return Surface::kerb;
    return beyond <= kerb + (offset >= 0 ? runoff_left : runoff_right) ? Surface::runoff
                                                                       : Surface::outside;
}

size_t Ribbon::build_box(size_t begin, size_t end) {
    auto first = nodes_[order_[begin]].station.point;
    Box b{first, first, begin, end};
    for (size_t j = begin; j < end; ++j)
        for (size_t i : {order_[j], order_[j] + 1}) {
            Vec p = nodes_[i].station.point;
            b.lo = {std::min(b.lo.x, p.x), std::min(b.lo.y, p.y), std::min(b.lo.z, p.z)};
            b.hi = {std::max(b.hi.x, p.x), std::max(b.hi.y, p.y), std::max(b.hi.z, p.z)};
        }
    size_t id = boxes_.size();
    boxes_.push_back(b);
    if (end - begin > 8) {
        bool x = (b.hi.x - b.lo.x) > (b.hi.y - b.lo.y);
        auto key = [&](size_t i) {
            Vec p = nodes_[i].station.point + nodes_[i + 1].station.point;
            return x ? p.x : p.y;
        };
        auto mid = begin + (end - begin) / 2;
        std::nth_element(
            order_.begin() + begin, order_.begin() + mid, order_.begin() + end,
            [&](size_t i, size_t j) { return std::pair{key(i), i} < std::pair{key(j), j}; });
        auto left = build_box(begin, mid), right = build_box(mid, end);
        boxes_[id].left = left;
        boxes_[id].right = right;
    }
    return id;
}

std::array<double, 3> Ribbon::project(Vec point) const {
    require(finite(point), "non-finite world position");
    double best = std::numeric_limits<double>::infinity(), s = 0;
    auto bound = [&](const Box &b) {
        Vec p{std::clamp(point.x, b.lo.x, b.hi.x), std::clamp(point.y, b.lo.y, b.hi.y),
              std::clamp(point.z, b.lo.z, b.hi.z)};
        return dot(point - p, point - p);
    };
    auto visit = [&](auto &&self, size_t id) -> void {
        const Box &b = boxes_[id];
        if (bound(b) > best)
            return;
        if (b.left) {
            auto left = b.left, right = b.right;
            if (bound(boxes_[right]) < bound(boxes_[left]))
                std::swap(left, right);
            self(self, left);
            self(self, right);
            return;
        }
        for (size_t j = b.begin; j < b.end; ++j) {
            size_t i = order_[j];
            Vec a = nodes_[i].station.point, v = nodes_[i + 1].station.point - a;
            double t = std::clamp(dot(point - a, v) / dot(v, v), 0., 1.);
            Vec residual = point - (a + v * t);
            double error = dot(residual, residual);
            double candidate = std::lerp(distances_[i], distances_[i + 1], t);
            if (std::pair{error, candidate} < std::pair{best, s}) {
                best = error;
                s = candidate;
            }
        }
    };
    visit(visit, 0);
    if (closed_)
        s = wrap(s, length());
    auto f = frame(s);
    return {s, dot(point - f.point, normal(f.forward)), std::sqrt(best)};
}

namespace {
Ribbon make_pit(const Ribbon &main, std::vector<Station> points, double in, double out) {
    require(!points.empty() && in >= 0 && in < main.length() && out >= 0 && out < main.length() &&
                in != out,
            "invalid pit junctions");
    auto a = main.frame(in), b = main.frame(out);
    points.insert(points.begin(), a.section);
    points.push_back(b.section);
    return Ribbon(std::move(points), false, a.forward, b.forward);
}
} // namespace

Track::Track(std::vector<Station> circuit, std::vector<Station> pit, double entry_fraction,
             double exit_fraction, double timing_fraction)
    : circuit_(std::move(circuit), true), entry_(entry_fraction * circuit_.length()),
      exit_(exit_fraction * circuit_.length()),
      pit_(make_pit(circuit_, std::move(pit), entry_, exit_)),
      pit_timing_(timing_fraction * pit_.length()) {
    require(timing_fraction > 0 && timing_fraction < 1, "invalid timing gate");
}
const Ribbon &Track::ribbon(Road road) const { return road == Road::pit ? pit_ : circuit_; }

Cursor Track::advance(Cursor p, double metres, bool take_pit) const {
    const double len = circuit_.length();
    require(metres >= 0 && metres <= 1e9 && std::isfinite(p.s) && p.s >= 0 &&
                (p.road == Road::pit ? p.s <= pit_.length() : p.s < len),
            "invalid movement or cursor");
    auto laps = [&](std::int64_t n) {
        require(p.lap <= std::numeric_limits<std::int64_t>::max() - n, "lap counter overflow");
        p.lap += n;
    };
    if (p.road == Road::circuit && take_pit) {
        double to_entry = wrap(entry_ - p.s, len);
        if (metres >= to_entry) {
            if (entry_ < p.s)
                laps(1);
            metres -= to_entry;
            p.road = Road::pit;
            p.s = 0;
        }
    }
    if (p.road == Road::pit) {
        double remaining = pit_.length() - p.s;
        if (entry_ > exit_ && p.s < pit_timing_ && p.s + metres >= pit_timing_)
            laps(1);
        if (metres < remaining) {
            p.s += metres;
            return p;
        }
        metres -= remaining;
        p.road = Road::circuit;
        p.s = exit_;
    }
    double end = p.s + metres;
    laps(static_cast<std::int64_t>(std::floor(end / len)));
    p.s = wrap(end, len);
    return p;
}

std::vector<std::pair<std::string, std::string>>
Track::overlaps(const std::vector<Body> &bodies) const {
    struct Rect {
        const Body *body;
        Vec base, along, side;
        double xmin, xmax;
    };
    std::vector<Rect> rects;
    std::set<std::string> ids;
    for (const auto &b : bodies) {
        require(!b.id.empty() && ids.insert(b.id).second, "duplicate or empty body ID");
        require(b.length > 0 && b.length <= 40 && b.width > 0 && b.width <= 10 && b.height > 0 &&
                    b.height <= 8 && std::isfinite(b.heading_delta),
                "invalid body envelope");
        auto f = ribbon(b.position.road).frame(b.position.s, b.offset);
        Vec along =
            f.forward * std::cos(b.heading_delta) + normal(f.forward) * std::sin(b.heading_delta);
        along.z = 0;
        Vec side = normal(along);
        double dx = (std::abs(along.x) * b.length + std::abs(side.x) * b.width) / 2;
        rects.push_back({&b, f.point, along, side, f.point.x - dx, f.point.x + dx});
    }
    std::sort(rects.begin(), rects.end(), [](const Rect &a, const Rect &b) {
        return std::tie(a.xmin, a.body->id) < std::tie(b.xmin, b.body->id);
    });
    std::vector<std::pair<std::string, std::string>> hits;
    auto radius = [](const Rect &r, Vec axis) {
        return (std::abs(dot(r.along, axis)) * r.body->length +
                std::abs(dot(r.side, axis)) * r.body->width) /
               2;
    };
    for (size_t i = 0; i < rects.size(); ++i) {
        const auto &a = rects[i];
        for (size_t j = i + 1; j < rects.size() && rects[j].xmin <= a.xmax; ++j) {
            const auto &b = rects[j];
            if (a.base.z + a.body->height < b.base.z || b.base.z + b.body->height < a.base.z)
                continue;
            bool separated = false;
            for (Vec axis : {a.along, a.side, b.along, b.side}) {
                if (std::abs(dot(a.base - b.base, axis)) > radius(a, axis) + radius(b, axis)) {
                    separated = true;
                    break;
                }
            }
            if (!separated)
                hits.emplace_back(std::minmax(a.body->id, b.body->id));
        }
    }
    std::sort(hits.begin(), hits.end());
    return hits;
}

Lines::Lines(const Track &track, double width, double margin, double smoothing_m)
    : track_(track), length_(track.ribbon(Road::circuit).length()),
      lateral_reserve_(width / 2 + margin) {
    const auto &circuit = track.ribbon(Road::circuit);
    require(width > 0 && width < 10 && margin >= 0 && margin < 10 && smoothing_m >= 2 &&
                smoothing_m <= 80,
            "invalid line parameters");
    const size_t n = std::max<size_t>(16, std::ceil(length_ / 2));
    const double step = length_ / n;
    std::vector<Vec> centres(n), normals(n);
    std::vector<double> lo(n), hi(n);
    lines_.resize(n);
    for (size_t i = 0; i < n; ++i) {
        auto f = circuit.frame(step * i);
        centres[i] = f.point;
        normals[i] = normal(f.forward);
        lo[i] = -f.section.right + width / 2 + margin;
        hi[i] = f.section.left - width / 2 - margin;
        // An inner offset at the radius of curvature folds the local ribbon.
        if (f.curvature > 0)
            hi[i] = std::min(hi[i], 0.75 / f.curvature);
        if (f.curvature < 0)
            lo[i] = std::max(lo[i], 0.75 / f.curvature);
        require(lo[i] <= 0 && hi[i] >= 0, "vehicle envelope does not fit");
    }
    // Periodic projected relaxation: shorten the turning line over a vehicle-class
    // lookahead. Jacobi reads one generation, so the lap seam has no special weight.
    std::vector<double> dry(n), next(n);
    const size_t stride = std::clamp<size_t>(std::round(smoothing_m / step), 1, n / 4);
    for (size_t span : {stride, std::max<size_t>(1, stride / 2), size_t{1}}) {
        for (int pass = 0; pass < 16; ++pass) {
            for (size_t i = 0; i < n; ++i) {
                auto a = (i + n - span) % n, b = (i + span) % n;
                Vec mid =
                    (centres[a] + normals[a] * dry[a] + centres[b] + normals[b] * dry[b]) * 0.5;
                next[i] = std::clamp(std::lerp(dry[i], dot(mid - centres[i], normals[i]), 0.5),
                                     lo[i], hi[i]);
            }
            dry.swap(next);
        }
    }
    for (size_t i = 0; i < n; ++i)
        lines_[i] = {std::lerp(dry[i], lo[i], 0.75), dry[i], std::lerp(dry[i], hi[i], 0.75)};
}

double Lines::offset(double s, double preference) const {
    require(std::isfinite(s) && preference >= -1 && preference <= 1, "invalid line request");
    double u = wrap(s, length_) * lines_.size() / length_;
    size_t i = static_cast<size_t>(u) % lines_.size(), j = (i + 1) % lines_.size();
    auto blend = [&](const auto &row) {
        return std::lerp(row[1], row[preference < 0 ? 0 : 2], std::abs(preference));
    };
    const auto f = track_.ribbon(Road::circuit).frame(s);
    const double lo = -f.section.right + lateral_reserve_;
    const double hi = f.section.left - lateral_reserve_;
    require(lo <= hi, "vehicle does not fit at interpolated station");
    return std::clamp(std::lerp(blend(lines_[i]), blend(lines_[j]), u - std::floor(u)), lo, hi);
}

double Lines::pit_offset(double s, double preference) const {
    require(preference >= -1 && preference <= 1, "invalid pit line preference");
    const auto &pit = track_.ribbon(Road::pit);
    const auto f = pit.frame(s);
    const double lo = -f.section.right + lateral_reserve_;
    const double hi = f.section.left - lateral_reserve_;
    require(lo <= 0 && hi >= 0, "vehicle envelope does not fit pit lane");
    const double target = preference * 0.75 * (preference < 0 ? -lo : hi);
    const bool entering = s <= pit.length() / 2;
    const double distance = entering ? s : pit.length() - s;
    const double t = std::min(1., distance / std::min(30., pit.length() / 2));
    if (t == 1.)
        return target;
    // Continue the circuit line through each shared junction, then ease towards
    // the service road line while respecting the taper of its cross-section.
    const double main_s = entering ? track_.entry() + s : track_.exit() - distance;
    const double weight = t * t * t * (10 + t * (-15 + t * 6));
    return std::clamp(std::lerp(offset(main_s, preference), target, weight), lo, hi);
}

double Lines::transition(double s, double from, double to, double travelled, double span) const {
    require(std::isfinite(travelled) && std::isfinite(span) && span > 0,
            "invalid transition distance");
    require(from >= -1 && from <= 1 && to >= -1 && to <= 1, "invalid line preference");
    double t = std::clamp(travelled / span, 0., 1.);
    double w = t * t * t * (10 + t * (-15 + 6 * t));
    return std::lerp(offset(s, from), offset(s, to), w);
}
} // namespace race
