#include "space.hpp"
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <memory>

namespace py = pybind11;
using namespace race;
namespace {
using Row = std::array<double, 11>;
std::vector<Station> stations(const std::vector<Row> &rows) {
    std::vector<Station> out;
    out.reserve(rows.size());
    for (const auto &r : rows)
        out.push_back({{r[0], r[1], r[2]}, r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10]});
    return out;
}
} // namespace
PYBIND11_MODULE(_race_space, m) {
    m.attr("CONTRACT_VERSION") = 1;
    py::enum_<Road>(m, "Road").value("circuit", Road::circuit).value("pit", Road::pit);
    py::enum_<Surface>(m, "Surface")
        .value("asphalt", Surface::asphalt)
        .value("kerb", Surface::kerb)
        .value("runoff", Surface::runoff)
        .value("outside", Surface::outside);
    py::class_<Cursor>(m, "Cursor")
        .def(py::init<Road, double, std::int64_t>())
        .def_readonly("road", &Cursor::road)
        .def_readonly("s", &Cursor::s)
        .def_readonly("lap", &Cursor::lap)
        .def(py::pickle([](const Cursor &c) { return py::make_tuple(1, c.road, c.s, c.lap); },
                        [](py::tuple t) {
                            if (t.size() != 4 || t[0].cast<int>() != 1)
                                throw std::invalid_argument("unsupported spatial cursor version");
                            return Cursor{t[1].cast<Road>(), t[2].cast<double>(),
                                          t[3].cast<std::int64_t>()};
                        }));
    py::class_<Body>(m, "Body").def(
        py::init<std::string, Cursor, double, double, double, double, double>(), py::arg("id"),
        py::arg("position"), py::arg("offset"), py::arg("length"), py::arg("width"),
        py::arg("height"), py::arg("heading_delta") = 0.);
    py::class_<Ribbon>(m, "Ribbon")
        .def_property_readonly("length", &Ribbon::length)
        .def("surface", &Ribbon::surface)
        .def(
            "project",
            [](const Ribbon &r, const std::vector<std::array<double, 3>> &points) {
                std::vector<std::array<double, 3>> out;
                out.reserve(points.size());
                for (auto p : points)
                    out.push_back(r.project({p[0], p[1], p[2]}));
                return out;
            },
            py::call_guard<py::gil_scoped_release>())
        .def(
            "sample",
            [](const Ribbon &r, const std::vector<std::array<double, 2>> &coordinates) {
                std::vector<std::array<double, 16>> out;
                out.reserve(coordinates.size());
                for (auto p : coordinates) {
                    auto f = r.frame(p[0], p[1]);
                    const auto &a = f.section;
                    out.push_back({f.point.x, f.point.y, f.point.z, f.forward.x, f.forward.y,
                                   f.curvature, f.grade, a.left, a.right, a.crossfall, a.roughness,
                                   a.kerb_left, a.kerb_right, a.runoff_left, a.runoff_right,
                                   static_cast<double>(a.surface(p[1]))});
                }
                return out;
            },
            py::call_guard<py::gil_scoped_release>());
    py::class_<Track>(m, "Track")
        .def(py::init([](int version, const std::vector<Row> &main, const std::vector<Row> &pit,
                         double in, double out, double gate) {
                 if (version != 1)
                     throw std::invalid_argument("unsupported geometry contract");
                 return std::make_unique<Track>(stations(main), stations(pit), in, out, gate);
             }),
             py::call_guard<py::gil_scoped_release>())
        .def("ribbon", &Track::ribbon, py::return_value_policy::reference_internal)
        .def_property_readonly("entry", &Track::entry)
        .def_property_readonly("exit", &Track::exit)
        .def_property_readonly("pit_timing", &Track::pit_timing)
        .def(
            "advance",
            [](const Track &track, const std::vector<std::tuple<Cursor, double, bool>> &batch) {
                std::vector<Cursor> result;
                result.reserve(batch.size());
                for (const auto &[cursor, metres, pit] : batch)
                    result.push_back(track.advance(cursor, metres, pit));
                return result;
            },
            py::call_guard<py::gil_scoped_release>())
        .def("overlaps", &Track::overlaps, py::call_guard<py::gil_scoped_release>());
    py::class_<Lines>(m, "Lines")
        .def(py::init<const Track &, double, double, double>(), py::keep_alive<1, 2>(),
             py::call_guard<py::gil_scoped_release>())
        .def(
            "pit_offsets",
            [](const Lines &lines, const std::vector<std::array<double, 2>> &points) {
                std::vector<double> result;
                result.reserve(points.size());
                for (const auto &p : points)
                    result.push_back(lines.pit_offset(p[0], p[1]));
                return result;
            },
            py::call_guard<py::gil_scoped_release>())
        .def(
            "transitions",
            [](const Lines &lines, const std::vector<std::array<double, 5>> &points) {
                std::vector<double> result;
                result.reserve(points.size());
                for (auto p : points)
                    result.push_back(lines.transition(p[0], p[1], p[2], p[3], p[4]));
                return result;
            },
            py::call_guard<py::gil_scoped_release>())
        .def(
            "offsets",
            [](const Lines &lines, const std::vector<std::array<double, 2>> &points) {
                std::vector<double> result;
                result.reserve(points.size());
                for (auto p : points)
                    result.push_back(lines.offset(p[0], p[1]));
                return result;
            },
            py::call_guard<py::gil_scoped_release>());
}
