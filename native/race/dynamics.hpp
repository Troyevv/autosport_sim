#pragma once
#include "contact.hpp"
#include "driver.hpp"
#include <array>
#include <map>
#include <memory>
#include <tuple>

namespace race {
inline constexpr double dt = .02, gravity = 9.80665, air_density = 1.225;
struct Spec {
    std::string id;
    double length, width, height, wheelbase, cg_height, front_weight, driver_mass;
    double dry_mass, power_kw, torque_nm, heat_kw, bsfc, flow_kg_s;
    double radiator_kw, inlet, radiator_inlet, base_drag, front_area, wing_area, wing_drag,
        floor_area;
    double spring_rate, tyre_rate, static_mm, design_mm, brake_nm, radius, mu;
    double efficiency, input_nm, first_ratio, top_ratio, final_drive, redline, shift_s, gear_heat;
    int gears;
    double motor_kw, battery_kj, deploy_floor, lap_deploy_kj, lap_regen_kj;
    double low_c, high_c, wear_rate, warmup_kj, max_load, water_flow;
    double wing, ride_mm, spring, antiroll, differential, bias, cooling;
    double compound_grip, compound_wear, compound_drain, tread_mm;
    std::array<double, 4> cold_kpa;
    bool abs, drs, kart;
    Driver driver;
};
struct Conditions {
    double ambient, track_c, water_mm;
    bool drs_enabled, unrestricted_drs;
    std::vector<std::array<double, 2>> zones; // fractional start/end pairs
    std::vector<double> sectors;
    std::uint64_t seed{};
    bool race_start = false, formation = false;
};
struct Tyre {
    double surface{}, core{}, wear{}, degradation{}, grain{}, blister{}, flat{};
    int cycles{};
    bool hot{}, punctured{};
};
struct Start {
    double s, d, v, fuel, energy, heading;
    std::array<Tyre, 4> tyres;
};
struct Control {
    bool automatic = true;
    double clutch = 1;
    bool reverse = false;
    bool push = false; // driver pushing a stalled direct-drive kart
    double throttle{}, brake{}, steer{}, deploy = 1, preference = 0;
    bool drs = true;
    int flag = 0; // 0 green, 1 neutralised, 2 approach pit entry
    int gear = 0; // zero selects the automatic shift controller
};
struct Order {
    std::int64_t tick;
    std::string entry;
    Control command;
};
struct State {
    Cursor cursor;
    double d{}, v{}, lateral_v{}, heading{}, fuel{}, energy{}, coolant{}, ax{}, ay{}, shift_left{};
    double used_kj{}, recovered_kj{}, distance{}, last_gate = -1;
    std::int64_t completed_laps{}, last_gate_index{};
    int gear = 1;
    bool contacted{}, reversing{};
    std::vector<double> detection_time, split_times;
    std::vector<int> eligible;
    std::vector<std::string> contact_peers;
    std::array<Tyre, 4> tyres;
    Control command;
    Mind mind;
};
struct Forces {
    double drag, lift, front_fraction, airflow;
};
struct Wheel {
    double load, pressure, mu, fx, fy, lock, slip_power;
};
struct Reading {
    double rpm{}, power{}, electric_kw{}, drag{}, lift{}, airflow{}, wake{}, ax{}, ay{};
    double throttle{}, brake{}, steer{}, drs{}, front_aero{}, shift{}, wheelspin{}, clutch = 1,
                                                                                    push_force{};
    std::array<Wheel, 4> wheels{};
};
struct Event {
    std::string kind, entry, other;
    double time, elapsed;
    std::int64_t lap;
    std::vector<double> split_times;
    int position{};
};
using Sample = std::vector<double>;
struct Batch {
    std::map<std::string, std::vector<Sample>> rows;
    std::vector<Event> events;
};
struct LinePoint {
    double d, ds, curvature, grade, crossfall, roughness;
};
using Candidates = std::vector<std::vector<LinePoint>>;
using GeometryCache =
    std::map<std::tuple<bool, double, double, double>, std::shared_ptr<const Candidates>>;
struct Profile {
    std::shared_ptr<const Candidates> candidates;
    std::vector<double> offset, speed, curvature, tangent, acceleration;
    double step{};
    int grip_bin = -1, mass_bin = -1;
};
struct Vehicle {
    Spec spec;
    State state;
    Profile profile;
    Reading reading;
    std::vector<double> ratios;
    double grid_offset, grid_station;
    Frame frame; // ribbon frame at the current centre, derived from cursor and d
    int grid_lap = 0; // initial epoch for a grid straddling the timing line
};
Forces aerodynamics(const Spec &p, double v, double wake, bool drs, double roughness);
double tyre_mu(const Spec &p, const Tyre &t, double load, double pressure, double water,
               double speed);
double pressure_kpa(const Spec &p, const Tyre &t, size_t corner);
void plan(const Track &track, Vehicle &car, const Conditions &env, GeometryCache &cache);
void initialise_driver(Vehicle &car, const Conditions &env);
void think(const Track &track, const Conditions &env, std::vector<Vehicle> &field, size_t index,
           std::int64_t tick, Batch &batch);
void finish_attack(Vehicle &car, const std::vector<Vehicle> &field, double length,
                   std::int64_t tick, Batch &batch);
Control control(const Track &track, const Vehicle &car, double gap, double leader_v);
void integrate(const Track &track, Vehicle &car, const Conditions &env, double wake, bool drs,
               Control input, double seconds = dt);
class Dynamics {
  public:
    Dynamics(const Track &track, Conditions conditions,
             std::vector<std::pair<Spec, Start>> entries);
    void enqueue(std::vector<Order> orders);
    Batch advance(int ticks, int stride);
    std::int64_t tick() const { return tick_; }
    const auto &cars() const { return cars_; }
    const auto &orders() const { return orders_; }
    void restore(std::int64_t tick, std::vector<State> states, std::vector<Order> queue);

  private:
    const Track &track_;
    Conditions env_;
    std::vector<Vehicle> cars_;
    GeometryCache geometry_;
    std::vector<Order> orders_;
    std::int64_t tick_ = 0;
    void step(Batch &batch);
};
} // namespace race
