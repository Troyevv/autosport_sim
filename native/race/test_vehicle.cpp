#include "dynamics.hpp"
#include <cmath>
#include <numbers>
#include <stdexcept>

using namespace race;
int main() {
    // A circular proving ground and an analytically specified single-speed car.
    std::vector<Station> ring;
    for (int i = 0; i < 96; ++i) {
        double a = 2 * std::numbers::pi * i / 96;
        ring.push_back({{100 * std::cos(a), 100 * std::sin(a), 0}, 6, 6, 0, .002, 0, 0, 1, 1});
    }
    Track track(ring, {ring[94], ring[1]}, .92, .08, .5);
    Spec p{};
    p.id = "one";
    p.length = 2;
    p.width = 1.4;
    p.height = .7;
    p.wheelbase = 1.1;
    p.cg_height = .28;
    p.front_weight = .42;
    p.driver_mass = 70;
    p.dry_mass = 82;
    p.power_kw = 31;
    p.torque_nm = 25;
    p.heat_kw = 17;
    p.bsfc = 450;
    p.flow_kg_s = .25;
    p.radiator_kw = 20;
    p.inlet = p.radiator_inlet = .01;
    p.base_drag = .32;
    p.spring_rate = p.tyre_rate = 100;
    p.static_mm = p.design_mm = 25;
    p.brake_nm = 140;
    p.radius = .14;
    p.mu = 1.4;
    p.efficiency = .98;
    p.input_nm = 25;
    p.first_ratio = p.top_ratio = 1;
    p.final_drive = 8;
    p.redline = 16000;
    p.gears = 1;
    p.low_c = 47;
    p.high_c = 70;
    p.wear_rate = .76;
    p.warmup_kj = 240;
    p.max_load = 1800;
    p.water_flow = .4;
    p.wing = p.spring = p.differential = p.cooling = 1;
    p.antiroll = .5;
    p.cold_kpa.fill(95);
    p.compound_grip = p.compound_wear = p.compound_drain = 1;
    p.tread_mm = 3.5;
    p.kart = true;
    Start start{0, 0, 8, 4, 0, 0, {}};
    for (auto &tyre : start.tyres)
        tyre.surface = tyre.core = 30;
    Dynamics live(track, {22, 30, 0, false, false, {}}, {{p, start}});
    Control command;
    command.automatic = false;
    command.brake = .4;
    live.enqueue({{850, "one", command}, {875, "one", {}}});
    live.advance(800, 0);
    Dynamics restored(track, {22, 30, 0, false, false, {}}, {{p, start}});
    restored.restore(live.tick(), {live.cars()[0].state}, live.orders());
    auto a = live.advance(3200, 50), b = restored.advance(3200, 50);
    if (a.rows != b.rows || a.events.empty() || live.cars()[0].state.distance < 1000 ||
        !(live.cars()[0].state.fuel < start.fuel))
        throw std::runtime_error("resource integration or checkpoint replay on the proving ground");
    for (auto &row : a.rows.at("one"))
        for (double x : row)
            if (!std::isfinite(x))
                throw std::runtime_error("non-finite telemetry");

    // Full closed loop on a traffic field, also exercised by the sanitizer build.
    std::vector<std::pair<Spec, Start>> entries;
    for (int i = 0; i < 12; ++i) {
        auto kart = p;
        kart.id = "kart-" + std::to_string(i);
        kart.driver.id = "pilot-" + std::to_string(i);
        kart.driver.risk = i / 12.;
        auto grid = start;
        grid.s = 120. - 4. * i;
        grid.d = i % 2 ? 2. : -2.;
        entries.emplace_back(kart, grid);
    }
    Conditions race{22, 30, 0, false, false, {}};
    race.race_start = true;
    race.seed = 18;
    Dynamics pack(track, race, entries), replay(track, race, entries);
    pack.advance(923, 0);
    std::vector<State> minds;
    for (const auto &car : pack.cars())
        minds.push_back(car.state);
    replay.restore(pack.tick(), minds, pack.orders());
    auto live_batch = pack.advance(1500, 10), replay_batch = replay.advance(1500, 10);
    if (live_batch.rows != replay_batch.rows ||
        live_batch.events.size() != replay_batch.events.size())
        throw std::runtime_error("traffic replay diverged");
    for (const auto &car : pack.cars())
        if (!car.state.mind.started || car.state.distance < 100 || !std::isfinite(car.state.v))
            throw std::runtime_error("driver failed to launch on proving ground");
}
