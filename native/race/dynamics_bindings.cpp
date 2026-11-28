#include "dynamics.hpp"
#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include <cmath>
#include <memory>

namespace py = pybind11;
using namespace race;
namespace {
double number(py::handle obj) {
    auto n = obj.cast<double>();
    if (!std::isfinite(n) || std::abs(n) > 1e8)
        throw std::invalid_argument("invalid physical scalar");
    return n;
}
Driver driver(const py::dict &data, const std::string &category) {
    Driver x;
    x.id = data["id"].cast<std::string>();
    if (x.id.empty())
        throw std::invalid_argument("missing driver identity");
    x.category = category;
    auto fraction = [&](const char *name) {
        double v = number(data[name]);
        if (v < 0 || v > 1)
            throw std::invalid_argument("driver parameter outside 0..1");
        return v;
    };
    x.pace = fraction("pace");
    x.braking = fraction("braking");
    x.cornering = fraction("cornering");
    x.attack = fraction("attack");
    x.defence = fraction("defence");
    x.consistency = fraction("consistency");
    x.tyres = fraction("tyres");
    x.rain = fraction("rain");
    x.feedback = fraction("feedback");
    x.endurance = fraction("endurance");
    x.trail = fraction("trail");
    x.balance = fraction("balance");
    x.exit = fraction("exit");
    x.kerb = fraction("kerb");
    x.care = fraction("care");
    x.risk = fraction("risk");
    x.smooth = fraction("smooth");
    x.fast_bends = fraction("fast_bends");
    x.resolve = fraction("resolve");
    x.ambition = fraction("ambition");
    x.adaptability = fraction("adaptability");
    x.experience = fraction("experience");
    x.familiarity = fraction("familiarity");
    x.confidence = fraction("confidence");
    x.fatigue = fraction("fatigue");
    x.launch = fraction("launch");
    x.fuel_use = fraction("fuel_use");
    x.pressure = fraction("pressure");
    x.judgement = fraction("judgement");
    return x;
}

template <class M, class Visitor> void mind_fields(M &x, Visitor visit) {
    visit("rng", x.rng);
    visit("roll_speed", x.roll_speed);
    visit("crawl_speed", x.crawl_speed);
    visit("crawl_steer", x.crawl_steer);
    visit("brake_ceiling", x.brake_ceiling);
    visit("wheelspin", x.wheelspin);
    visit("radio_line", x.radio_line);
    visit("radio_deploy", x.radio_deploy);
    visit("target_d", x.target_d);
    visit("defence_line", x.defence_line);
    visit("defended", x.defended);
    visit("crossed", x.crossed);
    visit("switching", x.switching);
    visit("launch_pending", x.launch_pending);
    visit("neutralised", x.neutralised);
    visit("target", x.target);
    visit("rival", x.rival);
    visit("position", x.position);
    visit("tactic", x.tactic);
    visit("next_scan", x.next_scan);
    visit("attack_ticks", x.attack_ticks);
    visit("retry_tick", x.retry_tick);
    visit("rival_until", x.rival_until);
    visit("release_tick", x.release_tick);
    visit("error_until", x.error_until);
    visit("blocked_ticks", x.blocked_ticks);
    visit("green_tick", x.green_tick);
    visit("wake", x.wake);
    visit("lock", x.lock);
    visit("last_brake", x.last_brake);
    visit("lane", x.lane);
    visit("blend", x.blend);
    visit("speed_limit", x.speed_limit);
    visit("brake_preview", x.brake_preview);
    visit("pedal_limit", x.pedal_limit);
    visit("deploy", x.deploy);
    visit("gap", x.gap);
    visit("lead_v", x.lead_v);
    visit("sense_time", x.sense_time);
    visit("grip_estimate", x.grip_estimate);
    visit("attention", x.attention);
    visit("confidence", x.confidence);
    visit("fatigue", x.fatigue);
    visit("tension", x.tension);
    visit("composure", x.composure);
    visit("familiarity", x.familiarity);
    visit("previous_throttle", x.previous_throttle);
    visit("side", x.side);
    visit("miss", x.miss);
    visit("launch_slip", x.launch_slip);
    visit("rolling", x.rolling);
    visit("jam", x.jam);
    visit("started", x.started);
    visit("formation_done", x.formation_done);
    visit("stalled", x.stalled);
    visit("error_active", x.error_active);
}

Spec specification(const py::dict &data) {
    Spec x{};
    x.id = data["id"].cast<std::string>();
#define NUMBER(key) x.key = number(data[#key])
    NUMBER(length);
    NUMBER(width);
    NUMBER(height);
    NUMBER(wheelbase);
    NUMBER(cg_height);
    NUMBER(front_weight);
    NUMBER(driver_mass);
    NUMBER(dry_mass);
    NUMBER(power_kw);
    NUMBER(torque_nm);
    NUMBER(heat_kw);
    NUMBER(bsfc);
    NUMBER(flow_kg_s);
    NUMBER(radiator_kw);
    NUMBER(inlet);
    NUMBER(radiator_inlet);
    NUMBER(base_drag);
    x.front_area = data.contains("front_area") ? data["front_area"].cast<double>() : 0.;
    if (!(x.front_area >= 0 && x.front_area < 10))
        throw std::invalid_argument("invalid front wing");
    NUMBER(wing_area);
    NUMBER(wing_drag);
    NUMBER(floor_area);
    NUMBER(spring_rate);
    NUMBER(tyre_rate);
    NUMBER(static_mm);
    NUMBER(design_mm);
    NUMBER(brake_nm);
    NUMBER(radius);
    NUMBER(mu);
    NUMBER(efficiency);
    NUMBER(input_nm);
    NUMBER(first_ratio);
    NUMBER(top_ratio);
    NUMBER(final_drive);
    NUMBER(redline);
    NUMBER(shift_s);
    NUMBER(gear_heat);
    NUMBER(motor_kw);
    NUMBER(battery_kj);
    NUMBER(deploy_floor);
    NUMBER(lap_deploy_kj);
    NUMBER(lap_regen_kj);
    NUMBER(low_c);
    NUMBER(high_c);
    NUMBER(wear_rate);
    NUMBER(warmup_kj);
    NUMBER(max_load);
    NUMBER(water_flow);
    NUMBER(wing);
    NUMBER(ride_mm);
    NUMBER(spring);
    NUMBER(antiroll);
    NUMBER(differential);
    NUMBER(bias);
    NUMBER(cooling);
    NUMBER(compound_grip);
    NUMBER(compound_wear);
    NUMBER(compound_drain);
    NUMBER(tread_mm);
#undef NUMBER
#define READ(key) x.key = data[#key].cast<decltype(x.key)>()
    READ(cold_kpa);
    READ(gears);
    READ(abs);
    READ(drs);
    READ(kart);
    for (double v :
         {x.power_kw,   x.radius,   x.radiator_inlet, x.static_mm, x.design_mm,   x.spring_rate,
          x.tyre_rate,  x.spring,   x.first_ratio,    x.top_ratio, x.final_drive, x.redline,
          x.efficiency, x.bsfc,     x.max_load,       x.tread_mm,  x.warmup_kj,   x.mu,
          x.input_nm,   x.torque_nm})
        if (v <= 0)
            throw std::invalid_argument("non-positive vehicle parameter");
    for (double value : x.cold_kpa)
        if (!(value >= 40 && value <= 250))
            throw std::invalid_argument("invalid cold pressure");
    if (x.high_c <= x.low_c || x.battery_kj < 0 || x.motor_kw < 0 || x.water_flow < 0 ||
        x.brake_nm < 0)
        throw std::invalid_argument("invalid component limits");
    return x;
}
Control command(const py::dict &data) {
    Control x;
    if (data.contains("flag"))
        READ(flag);
    if (data.contains("clutch"))
        READ(clutch);
    if (data.contains("push"))
        READ(push);
    if (data.contains("reverse"))
        READ(reverse);
    READ(automatic);
    READ(gear);
    READ(throttle);
    READ(brake);
    READ(steer);
    READ(deploy);
    READ(preference);
    READ(drs);
    return x;
}
#define WRITE(key) data[#key] = x.key
py::dict encode(const Control &x) {
    py::dict data;
    WRITE(flag);
    WRITE(clutch);
    WRITE(push);
    WRITE(reverse);
    WRITE(automatic);
    WRITE(gear);
    WRITE(throttle);
    WRITE(brake);
    WRITE(steer);
    WRITE(deploy);
    WRITE(preference);
    WRITE(drs);
    return data;
}
Tyre tyre(const py::dict &data) {
    Tyre x{};
    READ(surface);
    READ(core);
    READ(wear);
    READ(degradation);
    READ(grain);
    READ(blister);
    READ(flat);
    READ(cycles);
    READ(hot);
    READ(punctured);
    return x;
}
py::dict encode(const Tyre &x) {
    py::dict data;
    WRITE(surface);
    WRITE(core);
    WRITE(wear);
    WRITE(degradation);
    WRITE(grain);
    WRITE(blister);
    WRITE(flat);
    WRITE(cycles);
    WRITE(hot);
    WRITE(punctured);
    return data;
}
std::array<Tyre, 4> tyres(const py::dict &data) {
    auto items = data["tyres"].cast<std::array<py::dict, 4>>();
    return {tyre(items[0]), tyre(items[1]), tyre(items[2]), tyre(items[3])};
}
std::vector<Order> queue(const py::list &items) {
    std::vector<Order> out;
    for (auto item : items) {
        auto d = item.cast<py::dict>();
        out.push_back({d["tick"].cast<std::int64_t>(), d["entry"].cast<std::string>(),
                       command(d["command"].cast<py::dict>())});
    }
    return out;
}
py::dict encode(const State &x) {
    py::dict data;
    WRITE(d);
    WRITE(v);
    WRITE(lateral_v);
    WRITE(heading);
    WRITE(fuel);
    WRITE(energy);
    WRITE(coolant);
    WRITE(ax);
    WRITE(ay);
    WRITE(shift_left);
    WRITE(used_kj);
    WRITE(recovered_kj);
    WRITE(completed_laps);
    WRITE(last_gate_index);
    WRITE(distance);
    WRITE(last_gate);
    WRITE(gear);
    WRITE(contacted);
    WRITE(reversing);
    WRITE(detection_time);
    WRITE(split_times);
    WRITE(eligible);
    WRITE(contact_peers);
    py::dict mind;
    mind_fields(x.mind, [&](auto name, const auto &value) { mind[name] = value; });
    data["driver_state"] = mind;
    data["s"] = x.cursor.s;
    data["lap"] = x.cursor.lap;
    data["command"] = encode(x.command);
    py::list wheels;
    for (const auto &t : x.tyres)
        wheels.append(encode(t));
    data["tyres"] = wheels;
    return data;
}
State decode(const py::dict &data, const Mind &initial, bool legacy) {
    State x;
    READ(d);
    READ(v);
    READ(lateral_v);
    READ(heading);
    READ(fuel);
    READ(energy);
    READ(coolant);
    READ(ax);
    READ(ay);
    READ(shift_left);
    READ(used_kj);
    READ(recovered_kj);
    READ(completed_laps);
    READ(last_gate_index);
    READ(distance);
    READ(last_gate);
    READ(gear);
    READ(contacted);
    if (!legacy)
        READ(reversing);
    READ(detection_time);
    READ(split_times);
    READ(eligible);
    READ(contact_peers);
    x.mind = initial;
    if (!legacy) {
        auto mind = data["driver_state"].cast<py::dict>();
        mind_fields(x.mind, [&](auto name, auto &value) {
            value = mind[name].template cast<std::decay_t<decltype(value)>>();
            if constexpr (std::is_floating_point_v<std::decay_t<decltype(value)>>)
                if (!std::isfinite(value))
                    throw std::invalid_argument("non-finite driver state");
        });
    }
    if (legacy && x.distance > 0)
        x.mind.started = true;
    x.cursor = {Road::circuit, data["s"].cast<double>(), data["lap"].cast<std::int64_t>()};
    x.command = command(data["command"].cast<py::dict>());
    x.tyres = tyres(data);
    return x;
}
#undef READ
#undef WRITE
} // namespace
void bind_dynamics(py::module_ &m) {
    py::class_<Dynamics>(m, "Dynamics")
        .def(py::init([](const Track &track, const py::dict &conditions, const py::list &field) {
                 Conditions env{number(conditions["ambient"]),
                                number(conditions["track_c"]),
                                number(conditions["water_mm"]),
                                conditions["drs_enabled"].cast<bool>(),
                                conditions["unrestricted_drs"].cast<bool>(),
                                conditions["zones"].cast<std::vector<std::array<double, 2>>>(),
                                conditions["sectors"].cast<std::vector<double>>()};
                 env.seed =
                     conditions.contains("seed") ? conditions["seed"].cast<std::uint64_t>() : 0;
                 env.race_start =
                     conditions.contains("race_start") && conditions["race_start"].cast<bool>();
                 env.formation =
                     conditions.contains("formation") && conditions["formation"].cast<bool>();
                 std::vector<std::pair<Spec, Start>> entries;
                 for (auto item : field) {
                     auto row = item.cast<py::dict>(), start = row["start"].cast<py::dict>();
                     auto spec = specification(row["spec"].cast<py::dict>());
                     if (row.contains("driver"))
                         spec.driver = driver(row["driver"].cast<py::dict>(),
                                              row["category"].cast<std::string>());
                     entries.emplace_back(std::move(spec),
                                          Start{number(start["s"]), number(start["d"]),
                                                number(start["v"]), number(start["fuel"]),
                                                number(start["energy"]), number(start["heading"]),
                                                tyres(start)});
                 }
                 py::gil_scoped_release release;
                 return std::make_unique<Dynamics>(track, std::move(env), std::move(entries));
             }),
             py::keep_alive<1, 2>())
        .def("enqueue", [](Dynamics &d, const py::list &orders) { d.enqueue(queue(orders)); })
        .def("advance",
             [](Dynamics &d, int ticks, int stride) {
                 Batch batch;
                 {
                     py::gil_scoped_release release;
                     batch = d.advance(ticks, stride);
                 }
                 py::list events;
                 for (const auto &e : batch.events) {
                     py::dict event;
                     event["kind"] = e.kind;
                     event["entry"] = e.entry;
                     event["other"] = e.other;
                     event["time_s"] = e.time;
                     event["elapsed_s"] = e.elapsed;
                     event["lap"] = e.lap;
                     event["split_times_s"] = e.split_times;
                     if (e.position)
                         event["position"] = e.position;
                     events.append(event);
                 }
                 py::dict result;
                 result["rows"] = batch.rows;
                 result["events"] = events;
                 return result;
             })
        .def("checkpoint",
             [](const Dynamics &d) {
                 py::dict data, states;
                 py::list orders;
                 for (const auto &c : d.cars())
                     states[py::str(c.spec.id)] = encode(c.state);
                 for (const auto &o : d.orders()) {
                     py::dict row;
                     row["tick"] = o.tick;
                     row["entry"] = o.entry;
                     row["command"] = encode(o.command);
                     orders.append(row);
                 }
                 data["version"] = 2;
                 data["tick"] = d.tick();
                 data["states"] = states;
                 data["queue"] = orders;
                 return data;
             })
        .def("restore", [](Dynamics &d, const py::dict &checkpoint) {
            int version = checkpoint["version"].cast<int>();
            if (version != 1 && version != 2)
                throw std::invalid_argument("unsupported dynamics checkpoint");
            std::vector<State> states;
            auto saved = checkpoint["states"].cast<py::dict>();
            if (saved.size() != d.cars().size())
                throw std::invalid_argument("checkpoint field mismatch");
            for (const auto &c : d.cars())
                states.push_back(
                    decode(saved[py::str(c.spec.id)].cast<py::dict>(), c.state.mind, version == 1));
            d.restore(checkpoint["tick"].cast<std::int64_t>(), std::move(states),
                      queue(checkpoint["queue"].cast<py::list>()));
        });
}
