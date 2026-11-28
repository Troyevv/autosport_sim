#pragma once

#include <array>
#include <cstdint>
#include <cstddef>
#include <utility>
#include <string>
#include <vector>

namespace race {
struct Vec {
    double x{}, y{}, z{};
};
enum class Surface { asphalt, kerb, runoff, outside };
struct Station {
    Vec point;
    double left, right, crossfall, roughness;
    double kerb_left, kerb_right, runoff_left, runoff_right;
    Surface surface(double offset) const;
};
struct Frame {
    Vec point, forward;
    double curvature, grade;
    Station section;
};
enum class Road { circuit, pit };
struct Cursor {
    Road road{};
    double s{};
    std::int64_t lap{};
};
struct Body {
    std::string id;
    Cursor position;
    double offset, length, width, height, heading_delta;
};

// SI throughout. Circuit distance is periodic. Pit distance is open.
class Ribbon {
  public:
    Ribbon(std::vector<Station> control, bool closed, Vec entry = {}, Vec exit = {});
    double length() const { return distances_.back(); }
    Frame frame(double s, double offset = 0) const;
    Surface surface(double s, double offset) const;
    bool contains_footprint(const Body &body) const;
    // Closest point on the 3D centreline, then signed distance in its local frame.
    std::array<double, 3> project(Vec point) const;

  private:
    struct Node {
        Station station;
        Vec tangent;
        double curvature;
    };
    struct Box {
        Vec lo, hi;
        size_t begin{}, end{}, left{}, right{};
    };
    std::vector<Node> nodes_;
    std::vector<double> distances_;
    std::vector<size_t> order_;
    std::vector<Box> boxes_;
    bool closed_;
    size_t build_box(size_t begin, size_t end);
};

class Track {
  public:
    Track(std::vector<Station> circuit, std::vector<Station> pit_interior, double entry_fraction,
          double exit_fraction, double timing_fraction);
    const Ribbon &ribbon(Road road) const;
    double entry() const { return entry_; }
    double exit() const { return exit_; }
    double pit_timing() const { return pit_timing_; }
    Cursor advance(Cursor from, double metres, bool take_pit) const;
    std::vector<std::pair<std::string, std::string>>
    overlaps(const std::vector<Body> &bodies) const;

  private:
    Ribbon circuit_;
    double entry_, exit_;
    Ribbon pit_;
    double pit_timing_;
};

// Immutable per layout / vehicle envelope. Offset in metres, positive to the left.
class Lines {
  public:
    Lines(const Track &track, double width, double margin, double smoothing_m);
    double offset(double s, double preference) const;
    double pit_offset(double s, double preference) const;
    double transition(double s, double from, double to, double travelled, double span) const;

  private:
    const Track &track_;
    double length_, lateral_reserve_;
    std::vector<std::array<double, 3>> lines_;
};
} // namespace race
