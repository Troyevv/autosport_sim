"""SQLite migration 10. Derived domain projections can be regenerated from a checkpoint."""

DDL = [
    """CREATE TABLE IF NOT EXISTS stat_reader (
        career TEXT PRIMARY KEY REFERENCES career(id), org TEXT, role TEXT NOT NULL,
        day TEXT NOT NULL, support TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS stat_session (
        career TEXT NOT NULL REFERENCES career(id), origin TEXT NOT NULL, session TEXT NOT NULL,
        scope TEXT NOT NULL, PRIMARY KEY(career,origin,session))""",
    """CREATE TABLE IF NOT EXISTS stat_instance (
        career TEXT NOT NULL REFERENCES career(id), origin TEXT NOT NULL, instance TEXT NOT NULL,
        identity TEXT NOT NULL, PRIMARY KEY(career,origin,instance))""",
    """CREATE TABLE IF NOT EXISTS stat_entry (
        career TEXT NOT NULL REFERENCES career(id), origin TEXT NOT NULL, session TEXT NOT NULL,
        entry TEXT NOT NULL, car TEXT NOT NULL, org TEXT NOT NULL, program TEXT,
        PRIMARY KEY(career,origin,session,entry), UNIQUE(career,origin,session,car))""",
    """CREATE TABLE IF NOT EXISTS stat_context (
        id INTEGER PRIMARY KEY, career TEXT NOT NULL REFERENCES career(id), body TEXT NOT NULL,
        UNIQUE(career,body))""",
    """CREATE TABLE IF NOT EXISTS stat_fact (
        id INTEGER PRIMARY KEY, career TEXT NOT NULL REFERENCES career(id), source TEXT NOT NULL, key TEXT NOT NULL,
        kind TEXT NOT NULL, day TEXT NOT NULL, origin TEXT NOT NULL, access TEXT NOT NULL,
        owner TEXT, person TEXT, org TEXT, series TEXT, season TEXT, layout TEXT, session TEXT,
        program TEXT, manufacturer TEXT, track TEXT, layout_version TEXT,
        context_id INTEGER REFERENCES stat_context(id), body TEXT NOT NULL, UNIQUE(career,source,key))""",
    *[
        f"CREATE INDEX IF NOT EXISTS stat_by_{column} ON stat_fact(career,{column},day) WHERE {column} IS NOT NULL"
        for column in (
            "person",
            "org",
            "series",
            "season",
            "layout",
            "session",
            "kind",
            "origin",
            "program",
            "manufacturer",
            "track",
            "layout_version",
        )
    ],
    "CREATE INDEX IF NOT EXISTS stat_page ON stat_fact(career,day)",
    "CREATE INDEX IF NOT EXISTS posting_stats ON posting(career,org,date,key)",
    """CREATE TABLE IF NOT EXISTS stat_laps (
        career TEXT NOT NULL REFERENCES career(id), session TEXT NOT NULL, entry TEXT NOT NULL,
        origin TEXT NOT NULL, access TEXT NOT NULL, owner TEXT NOT NULL, laps INTEGER NOT NULL,
        fastest_us INTEGER, PRIMARY KEY(career,session,entry,origin,access,owner))""",
    """CREATE TABLE IF NOT EXISTS stat_policy (career TEXT PRIMARY KEY REFERENCES career(id),
        period_us INTEGER NOT NULL, archive_days INTEGER)""",
    """CREATE TABLE IF NOT EXISTS stat_channel (
        career TEXT NOT NULL REFERENCES career(id), session TEXT NOT NULL, car TEXT NOT NULL,
        channel TEXT NOT NULL, instance TEXT NOT NULL, first_us INTEGER NOT NULL, end_us INTEGER NOT NULL,
        day TEXT NOT NULL, meta TEXT NOT NULL, digest TEXT NOT NULL, samples BLOB,
        PRIMARY KEY(career,session,car,channel,instance,first_us))""",
    "CREATE INDEX IF NOT EXISTS stat_retention ON stat_channel(career,day) WHERE samples IS NOT NULL",
]
