#pragma once
#include <cstdint>
#include <string>

namespace race {
struct Driver {
    std::string id, category;
    double pace = .75, braking = .75, cornering = .75, attack = .75, defence = .75,
           consistency = .75, tyres = .75, rain = .75, feedback = .75, endurance = .75,
           launch = .75, fuel_use = .75, pressure = .75, judgement = .75;
    double trail = .5, balance = .5, exit = .5, kerb = .5, care = .5, risk = .5, smooth = .5,
           fast_bends = .5;
    double resolve = .6, ambition = .6, adaptability = .6, experience = .5, familiarity = .8,
           confidence = .7, fatigue = 0;
};
enum class Tactic {
    clear,
    pursue,
    attack,
    defend,
    counter,
    crossover,
    alongside,
    yield,
    cool,
    obstacle,
    recover,
    conserve,
    damaged,
    formation,
    launch,
    pit
};
struct Mind {
    std::uint64_t rng = 1;
    std::string target, rival, defended;
    int position = 0, tactic = 0;
    std::int64_t next_scan = 0, attack_ticks = 0, retry_tick = 0, rival_until = 0, release_tick = 0,
                 error_until = 0, blocked_ticks = 0, green_tick = 0;
    double roll_speed = 0, crawl_steer = 0, crawl_speed = 0, brake_ceiling = 1, wheelspin = 0,
           radio_line = 0, radio_deploy = 1, target_d = 0, defence_line = 0, wake = 0, lock = 0,
           last_brake = 0, lane = 0, blend = 0, speed_limit = 150, brake_preview = .12,
           pedal_limit = 1, deploy = 1, gap = 1000, lead_v = 0, sense_time = 0, grip_estimate = 1,
           attention = .8, confidence = .7, fatigue = 0, tension = 0, composure = .8,
           familiarity = .8, previous_throttle = 0, side = 0, miss = 0, launch_slip = 0;
    bool crossed = false, switching = false, launch_pending = false, neutralised = false,
         rolling = false, jam = false, started = false, formation_done = false, stalled = false,
         cranking = false, error_active = false;
};
} // namespace race
