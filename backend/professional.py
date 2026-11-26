"""Versioned, contributor-specific professional facts shared by career commands and future event producers."""

from datetime import date
from hashlib import sha256
from typing import Literal
from pydantic import Field, model_validator

from .domain import RuleError
from .personnel import active, age_on, bookings, shifted
from .staff_input import Fields, Day, Id

# Each source supplies the subset actually exercised. Using an unrelated skill is an error.
ACTIVITIES = {
    "practice": ("Практика", "driver", "Торможение Повороты Шины Дождь Адаптивность"),
    "qualifying": ("Квалификация", "driver", "Темп Торможение Повороты Дождь"),
    "race": (
        "Гонка",
        "driver",
        "Темп Обгоны Защита Шины Топливо Стабильность Старт Реакция Дождь Оценка_риска Работа_под_давлением",
    ),
    "track-test": (
        "Трассовые испытания",
        "driver",
        "Обратная_связь Повороты Шины Дождь",
    ),
    "simulator": (
        "Работа на симуляторе",
        "driver",
        "Стабильность Торможение Реакция Повороты",
    ),
    "fitness": ("Физическая подготовка", "driver", "Выносливость"),
    "feedback": (
        "Технический разбор",
        "driver race-engineer coach",
        "Обратная_связь Коммуникация Понимание_пилота Телеметрия",
    ),
    "setup": (
        "Работа над настройкой",
        "race-engineer",
        "Настройка Телеметрия Понимание_пилота",
    ),
    "diagnosis": (
        "Диагностика неисправности",
        "race-engineer reliability chief-mechanic technical-advisor engines transmissions tyres tyre-construction",
        "Диагностика Технические_знания Ресурс Износ Перегрев Прочность Предотвращение_отказов",
    ),
    "strategy": (
        "Стратегическое решение",
        "strategist",
        "Стратегия Соперники Риск Скорость_решений Прогнозирование Погода Анализ_данных Адаптивность",
    ),
    "debrief": ("Анализ выполненной работы", "*", "*"),
    "design": (
        "Разработка компонента",
        "aero chassis engines transmissions tyres tyre-construction reliability performance chief-engineer",
        "*",
    ),
    "cfd": ("Расчёт CFD", "aero", "Прижим Сопротивление Эффективность"),
    "wind-tunnel": (
        "Аэродинамическая труба",
        "aero",
        "Прижим Сопротивление Эффективность",
    ),
    "department-work": (
        "Работа инженерного подразделения",
        "engineering-unit",
        "Квалификация Точность",
    ),
    "bench-test": (
        "Стендовые испытания",
        "engines transmissions tyres tyre-construction chief-engineer analyst chief-analyst performance",
        "*",
    ),
    "correlation": (
        "Анализ корреляции",
        "aero analyst chief-analyst academy-analyst",
        "Эффективность Телеметрия Точность Дефекты",
    ),
    "client-data": (
        "Анализ данных клиента",
        "engines transmissions tyres tyre-construction technical-advisor analyst chief-analyst",
        "*",
    ),
    "assembly": (
        "Сборка и обслуживание",
        "chief-mechanic mechanics",
        "Сборка Ремонт Точность Скорость",
    ),
    "pit-stop": (
        "Пит-стоп",
        "chief-mechanic mechanics",
        "Пит-стопы Координация Точность Скорость Давление",
    ),
    "pit-drill": (
        "Тренировка пит-бригады",
        "chief-mechanic mechanics",
        "Пит-стопы Координация Точность Скорость Давление",
    ),
    "scouting": (
        "Скаутское наблюдение",
        "scout",
        "Оценка_потенциала Оценка_навыков Поиск",
    ),
    "scout-review": (
        "Проверка прежней оценки",
        "scout",
        "Оценка_потенциала Оценка_навыков",
    ),
    "negotiation": (
        "Кадровые переговоры",
        "manager owner manufacturer academy-director",
        "Переговоры Оценка_руководителей",
    ),
    "commercial": (
        "Коммерческие переговоры",
        "supply manufacturer manager owner academy-director",
        "Переговоры Клиенты Ценообразование Финансовое_планирование Бюджет",
    ),
    "management": (
        "Кадровое решение",
        "manager owner manufacturer academy-director",
        "Управление_людьми Координация Разрешение_конфликтов Стратегия Оценка_руководителей Планирование Ресурсы",
    ),
    "objective": (
        "Проверка цели",
        "manager owner manufacturer academy-director",
        "Решения Бюджет Стратегия Планирование Финансовое_планирование",
    ),
    "coaching": (
        "Наставничество",
        "coach race-engineer chief-engineer",
        "Методика Обратная_связь Коммуникация Координация",
    ),
}


class Context(Fields):
    wet: bool = False
    series: Id | None = None
    entry: Id | None = None
    place: int | None = Field(default=None, ge=1)
    licence_points: int = Field(default=0, ge=0)
    program: Id | None = None
    mentor: Id | None = None
    reviewed: Id | None = None
    achievement: (
        Literal[
            "win",
            "podium",
            "pole",
            "title",
            "validated-design",
            "resolved-fault",
            "met-objective",
        ]
        | None
    ) = None


class Activity(Fields):
    event_id: Id
    person: Id
    role: Id
    org: Id
    kind: Id
    skills: list[Id] = Field(min_length=1, max_length=5)
    difficulty: int = Field(ge=1, le=100)
    result: Literal["completed", "failed", "reviewed"]
    date: Day
    context: Context = Field(default_factory=Context)

    @model_validator(mode="after")
    def relevant(self):
        if self.event_id.startswith("age:"):
            raise ValueError("Зарезервированный источник.")
        review = self.kind in ("debrief", "scout-review")
        if review != bool(self.context.reviewed) or review != (
            self.result == "reviewed"
        ):
            raise ValueError("Разбор должен ссылаться на исходное событие.")
        if self.kind not in ACTIVITIES or len(set(self.skills)) != len(self.skills):
            raise ValueError("Неизвестная или повторяющаяся деятельность.")
        _, roles, skills = ACTIVITIES[self.kind]
        if roles != "*" and self.role not in roles.split():
            raise ValueError("Деятельность не соответствует профессии.")
        if skills != "*" and not set(self.skills) <= {
            s.replace("_", " ") for s in skills.split()
        }:
            raise ValueError("Навык не задействован в этой деятельности.")
        if "Дождь" in self.skills and not self.context.wet and not review:
            raise ValueError("Для опыта в дождь нужны подтверждённые мокрые условия.")
        context = self.context
        if context.entry:
            if self.kind != "race" or not context.series or self.role != "driver":
                raise ValueError("Классификация требует участия пилота в гонке.")
            if (
                context.achievement == "win"
                and context.place != 1
                or context.achievement == "podium"
                and context.place not in (1, 2, 3)
            ):
                raise ValueError("Достижение расходится с классификацией.")
        elif context.place is not None or context.licence_points:
            raise ValueError("Требуется заявка классификации.")
        milestones = {
            "validated-design": "design",
            "resolved-fault": "diagnosis",
            "met-objective": "objective",
        }
        achievement = self.context.achievement
        if achievement in milestones and (
            self.kind != milestones[achievement] or self.result != "completed"
        ):
            raise ValueError("Достижению требуется соответствующий результат работы.")
        if (
            achievement
            and achievement not in milestones
            and (
                self.role != "driver"
                or self.kind != ("qualifying" if achievement == "pole" else "race")
                or not self.context.series
                or self.result != "completed"
            )
        ):
            raise ValueError(
                "Личное достижение должно относиться к результату участника."
            )
        return self


class Batch(Fields):
    facts: list[Activity] = Field(min_length=1, max_length=100)


def activate(state):
    if "growth_since" in state:
        return
    state.update(
        growth_since=state["revision"],
        work_log={},
        experience_by_skill={},
        age_reserve={},
        preparations={},
        legacy_preparation={},
    )
    for p in state["people"].values():
        course = p.pop("training", None)
        completed = p.pop("courses", 0)
        if course or completed:
            state["legacy_preparation"][p["id"]] = dict(
                completed=completed, cancelled=course, date=state["date"]
            )
        if p["position"] == "driver":
            p["reaction"] = p["skills"]["Старт"]
    from .catalog import WORLD

    for aid, rows in state["seats"].items():
        for row in rows:
            row.setdefault(
                "agreed_end",
                state["offers"].get(row.get("offer"), {}).get("end", row["end"]),
            )
            row.setdefault("position", WORLD["assignments"][aid]["position"])


GROUP_SKILLS = {
    "Квалификация": "qualification",
    "Точность": "precision",
    "Скорость": "speed",
    "Давление": "pressure",
}


def attribute(person, skill):
    if skill == "Реакция":
        return person, "reaction"
    if skill == "Адаптивность" and skill not in person.get("skills", {}):
        return person, "adaptability"
    if "skills" not in person:
        return person, GROUP_SKILLS.get(skill)
    return person["skills"], skill


def assigned(state, world, pid, role, org, day):
    if role == "engineering-unit":
        g = state["collectives"].get(pid, {})
        return g.get("org") == org and g.get("name") != "Механики и пит-бригада"
    if role == "mechanics":
        g = state["collectives"].get(pid, {})
        return g.get("org") == org and g.get("name") == "Механики и пит-бригада"
    return any(
        world["assignments"][aid]["org"] == org
        and world["assignments"][aid]["position"] == role
        and active(r, day)
        for aid, r in bookings(state, pid)
    ) or (
        role == "driver"
        and any(
            s["person"] == pid
            and state["academies"][s["academy"]]["org"] == org
            and active(s, day)
            for s in state["scholarships"].values()
        )
    )


def curve(role, skill, person):
    # Learning peaks vary by task. Experience-dependent judgement remains trainable late in a career.
    if skill in ("Реакция", "Старт", "Выносливость", "Адаптивность", "Скорость"):
        peak = {
            "Реакция": 27,
            "Старт": 29,
            "Выносливость": 32,
            "Адаптивность": 36,
            "Скорость": 33,
        }[skill]
    elif skill in (
        "Стабильность",
        "Шины",
        "Оценка риска",
        "Стратегия",
        "Риск",
        "Понимание пилота",
    ):
        peak = 44
    else:
        peak = (
            49
            if role
            in ("manager", "owner", "strategist", "chief-engineer", "manufacturer")
            else 42
        )
    return (
        peak
        + (person.get("professionalism", 65) - 65) // 12
        + sha256((person["id"] + skill).encode()).digest()[0] % 7
        - 3
    )


def threshold(level):
    return 80 + level * level // 22


def record(state, world, event: Activity, *, assignment_day=None):
    """Called inside the producer's transaction. A stable source ID may credit multiple named contributors."""
    payload = event.model_dump()
    key = event.person + "|" + event.event_id
    log = state["work_log"]
    if key in log:
        if log[key]["fact"] != payload:
            raise RuleError("Идентификатор профессионального события уже занят.")
        return log[key]
    plan = None
    if event.context.program:
        plan = state["preparations"].get(event.context.program)
        if (
            not plan
            or plan["kind"] != "bench-test"
            or event.kind != "bench-test"
            or plan["org"] != event.org
            or plan["participants"] != [event.person]
            or plan["end"] != event.date
            or plan["status"] != "awaiting-result"
        ):
            raise RuleError("Протокол не соответствует назначенным испытаниям.")
        assignment_day = shifted(plan["end"], -1)
    duty_day = assignment_day or event.date
    if event.date != state["date"] or not assigned(
        state, world, event.person, event.role, event.org, duty_day
    ):
        raise RuleError("Дата или действующее назначение не подтверждают участие.")
    p = state["people"].get(event.person) or state["collectives"][event.person]
    if (
        event.context.series
        and event.context.series not in world["organizations"][event.org]["programs"]
    ):
        raise RuleError("Неизвестная программа организации.")
    if (
        event.context.series
        and event.kind in {"race", "practice", "qualifying", "track-test"}
        and not any(
            world["assignments"][aid]["series"] == event.context.series
            and world["assignments"][aid]["org"] == event.org
            and active(r, event.date)
            for aid, r in bookings(state, event.person)
        )
    ):
        raise RuleError("Участие в чемпионате не подтверждено назначением.")
    prior = log.get(event.person + "|" + (event.context.reviewed or ""))
    if event.kind in ("debrief", "scout-review") and (
        not prior
        or prior["fact"]["org"] != event.org
        or not set(event.skills) <= set(prior["fact"]["skills"])
        or prior["fact"]["kind"] in ("debrief", "scout-review")
    ):
        raise RuleError("Для разбора требуется подтверждённая исходная работа.")
    if prior and any(
        r["fact"]["person"] == event.person
        and r["fact"]["context"].get("reviewed") == event.context.reviewed
        for r in log.values()
    ):
        raise RuleError("Исходная работа уже разобрана.")
    mentor = state["people"].get(event.context.mentor)
    if event.context.mentor and (
        not mentor
        or mentor["id"] == event.person
        or not assigned(
            state, world, mentor["id"], mentor["position"], event.org, duty_day
        )
    ):
        raise RuleError("Наставник не имеет назначения в программе.")
    if mentor and any(
        world["assignments"][aid]["org"] == event.org
        and active(row, duty_day)
        and row.get("remit") == "supervised"
        for aid, row in bookings(state, mentor["id"])
    ):
        raise RuleError("Наставнику не делегировано самостоятельное руководство.")
    for skill in event.skills:
        fields, k = attribute(p, skill)
        if k not in fields:
            raise RuleError("Навык отсутствует у участника.")
    if (
        event.kind == "feedback"
        and event.role == "driver"
        and mentor
        and mentor["position"] == "race-engineer"
    ):
        from .teamwork import record_event

        record_event(
            state,
            world,
            event.person,
            mentor["id"],
            "confirmed-feedback" if event.result == "completed" else "unclear-feedback",
            event.event_id,
            event.date,
        )
    if event.context.entry:
        from .backing import record_result

        entry = world["entries"].get(event.context.entry)
        if not entry or (entry["org"], entry["championship"]) != (
            event.org,
            event.context.series,
        ):
            raise RuleError("Классификация относится к другой заявке.")
        record_result(
            state,
            event.person,
            event.event_id,
            event.date,
            world=world,
            entry=event.context.entry,
            place=event.context.place,
            licence_points=event.context.licence_points,
        )
    counters = state["experience_by_skill"].setdefault(event.person, {})
    deltas = {}
    for skill in event.skills:
        fields, k = attribute(p, skill)
        level = fields[k]
        total = counters.setdefault(skill, dict(xp=0, work=0, uses={}))
        uses = total["uses"].get(event.kind, 0)
        potential = p.get("potential", 100)
        age = age_on(p, event.date) if "birth_date" in p else 32
        peak = curve(event.role, skill, p)
        aptitude = max(35, 110 - 2 * max(0, age - peak))
        if skill in (
            "Реакция",
            "Старт",
            "Адаптивность",
            "Выносливость",
            "Торможение",
            "Дождь",
        ):
            aptitude += min(15, max(0, peak - age))
        elif skill in (
            "Стратегия",
            "Стабильность",
            "Риск",
            "Управление людьми",
            "Технические знания",
        ):
            aptitude += min(12, p.get("experience", 0))
        challenge = max(10, 70 - abs(level - event.difficulty))
        mentor_skill = max(
            (mentor or {}).get("skills", {}).get(s, 0)
            for s in ("Методика", "Коммуникация", "Координация")
        )
        insight = 8 if prior and prior["fact"]["result"] == "failed" else 0
        rate = (
            22
            + challenge // 3
            + max(0, potential - level) // 3
            + p.get("professionalism", 60) // 8
            + min(12, p.get("experience", 0))
            + (p.get("adaptability", 60) + p.get("ambition", 60)) // 22
            + mentor_skill // 7
            + insight
            + 20 // (1 + uses)
        )
        points = max(1, rate * aptitude // (100 * len(event.skills)))
        total["work"] += points
        total["xp"] += points
        total["uses"][event.kind] = uses + 1
        while level < potential and total["xp"] >= threshold(level):
            total["xp"] -= threshold(level)
            level += 1
        total["xp"] = min(total["xp"], threshold(level) - 1)
        deltas[skill] = dict(before=fields[k], after=level, xp=points)
        fields[k] = level
    line = dict(
        version=1,
        fact=payload,
        changes=deltas,
        discipline=world["championships"][event.context.series]["discipline"]
        if event.context.series
        else None,
    )
    log[key] = line
    if plan:
        plan.update(status="completed", result=event.event_id)
    # Form is a dated state; the permanent trait requires repeated distinct contributions.
    if "traits" in p:
        focus = next((skill for skill in event.skills if skill in p["skills"]), None)
        if focus and event.result == "completed" and event.difficulty >= 70:
            p["traits"] = [t for t in p["traits"] if t["id"] != "focused"]
            p["traits"].append(
                dict(
                    id="focused",
                    skill=focus,
                    start=event.date,
                    end=shifted(event.date, 5),
                )
            )
        if (
            len(counters) >= 2
            and sum(len(v["uses"]) for v in counters.values()) >= 5
            and not any(t["id"] == "practiced" for t in p["traits"])
        ):
            p["traits"].append(dict(id="practiced", start=event.date, end=None))
    return line


def age_interval(state, p, start, end):
    """Accumulate fractional wear in fixed-point units. Integrate by age-year, independent of tick size."""
    if "birth_date" not in p:
        return
    reserves = state["age_reserve"].setdefault(p["id"], {})
    keys = ["Адаптивность"]
    if p["position"] == "driver":
        keys += ["Реакция", "Старт", "Выносливость"]
    elif p["position"] == "strategist":
        keys += ["Скорость решений"]
    for skill in keys:
        fields, k = attribute(p, skill)
        peak = curve(p["position"], skill, p) + (
            8 if skill == "Скорость решений" else 4
        )
        day = date.fromisoformat(start)
        stop = date.fromisoformat(end)
        while day < stop:
            years = age_on(p, day.isoformat())
            birth = date.fromisoformat(p["birth_date"])
            try:
                boundary = birth.replace(year=birth.year + years + 1)
            except ValueError:
                boundary = date(birth.year + years + 1, 3, 1)
            finish = min(boundary, stop)
            rate = max(0, min(30, years - peak)) * max(
                4,
                16
                - (
                    p["professionalism"]
                    + p["potential"]
                    + min(
                        30,
                        sum(
                            v["work"]
                            for v in state["experience_by_skill"]
                            .get(p["id"], {})
                            .values()
                        )
                        // 500,
                    )
                )
                // 17,
            )
            if rate and fields[k] > 0:
                remainder = reserves.get(skill, 0)
                days = (finish - day).days
                period = 16000
                elapsed = 0
                while elapsed < days and fields[k] > 0:
                    needed = (period - remainder + rate - 1) // rate
                    if elapsed + needed > days:
                        remainder += (days - elapsed) * rate
                        break
                    elapsed += needed
                    remainder += needed * rate - period
                    when = shifted(day.isoformat(), elapsed)
                    old = fields[k]
                    fields[k] -= 1
                    state["work_log"][f"{p['id']}|age:{skill}:{when}"] = dict(
                        version=1,
                        fact=dict(
                            person=p["id"],
                            role=p["position"],
                            org=None,
                            date=when,
                            kind="age",
                            event_id=f"age:{skill}:{when}",
                            context={},
                            skills=[skill],
                        ),
                        discipline=None,
                        changes={skill: dict(before=old, after=old - 1, xp=0)},
                    )
                reserves[skill] = remainder
            day = finish


def projection(state, world, pid):
    org = state["setup"]["org"]
    visible = []
    for row in state["work_log"].values():
        f = row["fact"]
        if f["person"] != pid:
            continue
        if f["org"] == org or (
            f["kind"] == "age"
            and assigned(state, world, pid, f["role"], org, f["date"])
        ):
            visible.append(
                dict(
                    **row, label=ACTIVITIES.get(f["kind"], ("Возрастная динамика",))[0]
                )
            )
        elif f["context"].get("achievement") in ("win", "podium", "pole", "title"):
            visible.append(
                dict(
                    label="Спортивное достижение",
                    fact={
                        k: f[k]
                        for k in ("date", "org", "role", "kind", "event_id", "person")
                    }
                    | {
                        "context": {
                            "achievement": f["context"]["achievement"],
                            "series": f["context"]["series"],
                        }
                    },
                    changes={},
                    discipline=row["discipline"],
                )
            )
    visible.sort(key=lambda r: (r["fact"]["date"], r["fact"]["event_id"]), reverse=True)
    summary = {}
    for r in visible:
        for skill, x in r["changes"].items():
            summary[skill] = summary.get(skill, 0) + x["xp"]
    legacy = state["legacy_preparation"].get(pid)
    if legacy and not any(
        world["assignments"][aid]["org"] == org and active(r, legacy["date"])
        for aid, r in bookings(state, pid)
    ):
        legacy = None
    return dict(history=visible, experience=summary, migration=legacy)
