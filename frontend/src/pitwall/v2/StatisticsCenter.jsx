import React, { useEffect, useMemo, useState } from 'react'
import { useGame, useStored, dateLabel, money } from '../core'
import { Icon, Button, Badge, Tabs } from '../ui'
import { PersonPortrait, RaceCar } from '../visuals'
import { DataChart } from './charts'
import {
  STAT_CATEGORIES as CATEGORIES,
  FACT_KINDS,
  AXIS_NAMES,
  buildStatisticsIndex,
  profileRows,
} from './stats-data'
import './stats.css'
const count = (n) => new Intl.NumberFormat('ru-RU').format(n)
const uniq = (a) => [...new Set(a.filter(Boolean))]
const category = (id) => CATEGORIES.find((c) => c.id === id)
const INITIAL = {
  query: '',
  series: '',
  org: '',
  classId: '',
  season: '2025',
  category: 'overview',
  page: 0,
  mode: 'facts',
  profileTab: 'overview',
  compare: [],
  journalKind: '',
  journalScope: 'public',
}
function Mark({ item, size = 46 }) {
  return (
    <span
      className={'st-mark st-mark-' + item.type}
      style={{
        width: size,
        height: size,
        '--mark-color': item.color || '#6bcdbc',
      }}
    >
      {item.type === 'drivers' || item.type === 'staff' ? (
        <PersonPortrait id={item.id} size={size} />
      ) : item.logo ? (
        <img src={item.logo} alt="" />
      ) : item.type === 'countries' ? (
        <b>{item.id}</b>
      ) : (
        <Icon name={category(item.type)?.icon || 'Globe2'} size={Math.round(size * 0.44)} />
      )}
    </span>
  )
}
function Source({ children, internal = false }) {
  return (
    <div className={'st-source ' + (internal ? 'internal' : '')}>
      <Icon name={internal ? 'LockKeyhole' : 'Database'} size={13} />
      <span>{children}</span>
    </div>
  )
}
function Missing({
  title = 'Завершённых сессий пока нет',
  text = 'Этот источник ещё не выдаёт результаты. После завершения сессий здесь появятся подтверждённые наблюдения.',
  demo,
  onDemo,
  compact = false,
}) {
  return (
    <div className={'st-missing ' + (compact ? 'compact' : '')}>
      <div className="st-missing-symbol">
        <Icon name="Archive" size={24} />
      </div>
      <div>
        <span className="st-kicker">ИСТОЧНИК ЕЩЁ НЕ ПОДКЛЮЧЁН</span>
        <h3>{title}</h3>
        <p>{text}</p>
        {false}
      </div>
    </div>
  )
}
function EntityButton({ item, open, small = false }) {
  return (
    <button
      type="button"
      className={'st-entity-button ' + (small ? 'small' : '')}
      onClick={() => open(item)}
    >
      <Mark item={item} size={small ? 32 : 40} />
      <span>
        <strong>{item.name}</strong>
        <small>{item.meta || category(item.type)?.singular}</small>
      </span>
      <Icon name="ArrowUpRight" size={15} />
    </button>
  )
}
export function StatisticsCenter() {
  const g = useGame(),
    index = useMemo(() => buildStatisticsIndex(g), [g.world, g.game, g.data.media, g.game.career.date])
  const [saved, setSaved] = useStored('statistics.v2', INITIAL),
    s = {
      ...INITIAL,
      ...saved,
    }
  const [period, setPeriod] = useState('6'),
    [selectedFact, setSelectedFact] = useState(null)
  const validCat =
    g.tab &&
    (['overview', 'journal', 'compare', 'archive', 'records'].includes(g.tab) || category(g.tab))
      ? g.tab
      : s.category
  const cat = validCat || 'overview',
    mode = s.mode
  const entityKey = g.entity || g.entityId || '',
    item = index.lookup[entityKey] || index.lookup[cat + ':' + entityKey]
  const set = (patch) =>
    setSaved((prev) => ({
      ...INITIAL,
      ...prev,
      ...patch,
    }))
  const go = (type = 'overview', patch = {}) => {
    set({
      category: type,
      page: 0,
      ...patch,
    })
    g.navigate('statistics', type, '')
  }
  const open = (it) => {
    if (!it) return
    set({
      category: it.type,
      profileTab: 'overview',
    })
    g.navigate('statistics', it.type, it.type + ':' + it.id)
  }
  const back = () => {
    g.navigate('statistics', cat, '')
    set({
      profileTab: 'overview',
    })
  }
  const compare = s.compare.map((key) => index.lookup[key]).filter(Boolean)
  const toggleCompare = (it) => {
    const key = it.type + ':' + it.id
    let list = s.compare.filter((x) => index.lookup[x]?.type === it.type)
    if (list.includes(key)) list = list.filter((x) => x !== key)
    else if (list.length < 3) list.push(key)
    else {
      g.notify('В одном сравнении — до трёх профилей. Уберите один, чтобы добавить другой.')
      return
    }
    set({
      compare: list,
    })
  }
  const showCompare = () => {
    if (compare.length < 2) {
      g.notify('Добавьте ещё один профиль того же типа.')
      return
    }
    go('compare')
  }
  useEffect(() => {
    if (entityKey && !item) {
      const found = index.facts.find((f) => f.key === entityKey)
      if (found)
        setSelectedFact(
          found.body
            ? found
            : {
                ...found,
                key: found.id,
                kind: found.type,
                day: found.date || found.at,
                access: 'internal',

                body: {
                  context: {
                    org: g.game.career.org,
                  },
                  data: {
                    detail: found.title || found.detail,
                  },
                },
              },
        )
    }
  }, [entityKey, item, index.facts])
  useEffect(() => {
    const search = (e) => {
      if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) {
        const field = document.querySelector('.st-searchbar input')
        if (field) {
          e.preventDefault()
          field.focus()
        }
      }
    }
    document.addEventListener('keydown', search)
    return () => document.removeEventListener('keydown', search)
  }, [])
  const filtersActive = s.query || s.series || s.org || s.classId
  const pool = category(cat) ? index.byType[cat] : index.all
  const filtered = useMemo(
    () =>
      pool.filter((it) => {
        const q = s.query.trim().toLocaleLowerCase('ru')
        if (
          q &&
          !`${it.name} ${it.meta || ''} ${it.detail || ''} ${index.country(it.country)} ${it.id}`
            .toLocaleLowerCase('ru')
            .includes(q)
        )
          return false
        if (s.series && !it.series.includes(s.series)) return false
        if (
          s.org &&
          it.org !== s.org &&
          !(it.entries || []).some((e) => e.org === s.org) &&
          !(it.persons || []).some((p) => p.org === s.org)
        )
          return false
        if (
          s.classId &&
          !it.series.some((id) => g.world.championships[id]?.classes?.includes(s.classId))
        )
          return false
        return true
      }),
    [pool, s.query, s.series, s.org, s.classId, index],
  )
  const page = Math.min(s.page, Math.max(0, Math.ceil(filtered.length / 12) - 1)),
    paged = filtered.slice(page * 12, page * 12 + 12)
  const openFact = (f) => setSelectedFact(f)
  const banner = (
    <header className="st-masthead">
      <div className="st-masthead-top">
        <span className="st-kicker">AUTOSPORT SIM / WORLD ARCHIVE</span>
        <span className="st-world-date">
          <Icon name="Globe2" size={13} />
          {dateLabel(g.game.career.date)} · единый мир
        </span>
      </div>
      <div className="st-masthead-title">
        <div>
          <h1>
            Мир автоспорта<span>.</span>
          </h1>
          <p>Люди. Организации. История, которая продолжается.</p>
        </div>
        <div className="st-masthead-numbers">
          <div>
            <strong>{index.byType.championships.length}</strong>
            <span>чемпионатов</span>
          </div>
          <div>
            <strong>{count(index.byType.drivers.length)}</strong>
            <span>пилотов</span>
          </div>
          <div>
            <strong>{index.byType.teams.length}</strong>
            <span>команд</span>
          </div>
        </div>
      </div>
      <div className="st-source-switch" role="group" aria-label="Источник статистики">
        <p>{'Публичные источники + разрешённые данные вашей организации.'}</p>
      </div>
    </header>
  )
  return (
    <div
      className={
        'st-center ' + (cat !== 'overview' || item ? 'has-context ' : '') + (item ? 'has-profile' : '')
      }
    >
      {banner}
      {false}
      <div className="st-workspace">
        <label className="st-mobile-category">
          <span>Раздел мира</span>
          <select value={cat} onChange={(e) => go(e.target.value)}>
            <option value="overview">Обзор мира</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label} · {index.byType[c.id].length}
              </option>
            ))}
            <option value="archive">Архив сезонов</option>
            <option value="records">Рекорды и рейтинги</option>
            <option value="journal">Журнал мира</option>
            <option value="compare">Сравнение · {compare.length}</option>
          </select>
        </label>
        <nav className="st-rail" aria-label="Категории статистического центра">
          <button className={cat === 'overview' && !item ? 'active' : ''} onClick={() => go('overview')}>
            <Icon name="Compass" size={17} />
            <span>Обзор мира</span>
          </button>
          <div className="st-rail-label">ЭНЦИКЛОПЕДИЯ</div>
          {CATEGORIES.map((c) => (
            <button key={c.id} className={cat === c.id ? 'active' : ''} onClick={() => go(c.id)}>
              <Icon name={c.icon} size={17} />
              <span>{c.label}</span>
              <small>{count(index.byType[c.id].length)}</small>
            </button>
          ))}
          <div className="st-rail-label">ХРОНИКА</div>
          <button className={cat === 'archive' ? 'active' : ''} onClick={() => go('archive')}>
            <Icon name="Archive" size={17} />
            <span>Архив сезонов</span>
          </button>
          <button className={cat === 'records' ? 'active' : ''} onClick={() => go('records')}>
            <Icon name="Medal" size={17} />
            <span>Рекорды и рейтинги</span>
          </button>
          <button className={cat === 'journal' ? 'active' : ''} onClick={() => go('journal')}>
            <Icon name="History" size={17} />
            <span>Журнал мира</span>
            <small>{count(index.facts.length)}</small>
          </button>
          <button
            className={cat === 'compare' ? 'active' : ''}
            onClick={() =>
              compare.length >= 2
                ? go('compare')
                : g.notify('Выберите два профиля одного типа в реестре.')
            }
          >
            <Icon name="GitCompareArrows" size={17} />
            <span>Сравнение</span>
            <small>{compare.length}</small>
          </button>
          <div className="st-rail-footer">
            <Icon name="LockKeyhole" size={14} />
            <p>
              Данные других организаций ограничены публичными источниками. Рейтинга «силы машины» здесь
              нет.
            </p>
          </div>
        </nav>
        <div className="st-main">
          {item ? (
            <Profile
              item={item}
              index={index}
              g={g}
              mode={mode}
              tab={s.profileTab}
              setTab={(t) =>
                set({
                  profileTab: t,
                })
              }
              open={open}
              back={back}
              period={period}
              setPeriod={setPeriod}
              compare={compare}
              toggleCompare={toggleCompare}
              go={go}
              onFact={openFact}
            />
          ) : cat === 'compare' ? (
            <CompareView
              items={compare}
              index={index}
              g={g}
              mode={mode}
              open={open}
              remove={toggleCompare}
              back={() => go(compare[0]?.type || 'drivers')}
            />
          ) : cat === 'archive' || cat === 'records' ? (
            <WorldArchive view={cat} index={index} g={g} mode={mode} open={open} />
          ) : cat === 'journal' ? (
            <Journal index={index} g={g} s={s} set={set} openFact={openFact} open={open} />
          ) : (
            <>
              <div className="st-searchbar">
                <Icon name="Search" size={18} />
                <input
                  aria-label="Поиск в статистическом центре"
                  value={s.query}
                  onChange={(e) =>
                    set({
                      query: e.target.value,
                      page: 0,
                    })
                  }
                  placeholder={
                    cat === 'overview'
                      ? 'Поиск по всему миру: человек, команда, трасса…'
                      : 'Поиск: ' + (category(cat)?.label || 'весь мир').toLowerCase()
                  }
                />
                {s.query && (
                  <button
                    type="button"
                    aria-label="Очистить поиск"
                    onClick={() =>
                      set({
                        query: '',
                        page: 0,
                      })
                    }
                  >
                    <Icon name="X" size={16} />
                  </button>
                )}
                <kbd>/</kbd>
              </div>
              <div className="st-filters">
                <label>
                  <span>Чемпионат</span>
                  <select
                    value={s.series}
                    onChange={(e) =>
                      set({
                        series: e.target.value,
                        page: 0,
                      })
                    }
                  >
                    <option value="">Все чемпионаты</option>
                    {Object.entries(g.world.championships).map(([id, v]) => (
                      <option key={id} value={id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Сезон</span>
                  <select value={s.season}>
                    <option value="2025">2025 · фактический</option>
                  </select>
                </label>
                <label>
                  <span>Класс</span>
                  <select
                    value={s.classId}
                    onChange={(e) =>
                      set({
                        classId: e.target.value,
                        page: 0,
                      })
                    }
                  >
                    <option value="">Все классы</option>
                    {uniq(Object.values(g.world.championships).flatMap((c) => c.classes)).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="st-org-filter">
                  <span>Организация</span>
                  <select
                    value={s.org}
                    onChange={(e) =>
                      set({
                        org: e.target.value,
                        page: 0,
                      })
                    }
                  >
                    <option value="">Все организации</option>
                    {[...index.byType.teams, ...index.byType.manufacturers].map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                {filtersActive && (
                  <button
                    className="st-reset"
                    type="button"
                    onClick={() =>
                      set({
                        query: '',
                        series: '',
                        org: '',
                        classId: '',
                        page: 0,
                      })
                    }
                  >
                    <Icon name="RotateCcw" size={14} />
                    Сбросить
                  </button>
                )}
              </div>
              {cat === 'overview' && !filtersActive ? (
                <Overview index={index} g={g} mode={mode} go={go} open={open} />
              ) : (
                <>
                  <div className="st-section-heading">
                    <div>
                      <span className="st-kicker">РЕЕСТР МИРА / {'2025'}</span>
                      <h2>
                        {category(cat)?.label || 'Результаты глобального поиска'}{' '}
                        <span>{count(filtered.length)}</span>
                      </h2>
                      <p>
                        {category(cat)?.description ||
                          'Связанные люди, организации, автомобили и события во всех категориях.'}
                      </p>
                    </div>
                  </div>
                  {filtered.length ? (
                    <>
                      <div className="st-directory" role="list">
                        <div className="st-directory-head">
                          <span>Профиль</span>
                          <span>Контекст</span>
                          <span>Источник</span>
                          <span>Сравнить</span>
                        </div>
                        {paged.map((it) => (
                          <div role="listitem" className="st-directory-row" key={it.type + it.id}>
                            <button
                              className="st-directory-primary"
                              type="button"
                              onClick={() => open(it)}
                            >
                              <Mark item={it} />
                              <span>
                                <strong>{it.name}</strong>
                                <small>
                                  {it.type === 'drivers' || it.type === 'staff'
                                    ? it.role
                                    : category(it.type)?.singular}{' '}
                                  {it.country ? '· ' + index.country(it.country) : ''}
                                </small>
                              </span>
                              <Icon name="ArrowUpRight" size={14} />
                            </button>
                            <div className="st-directory-context">
                              <span>{it.meta}</span>
                              <small>
                                {it.count != null
                                  ? count(it.count) + ' ' + it.countLabel
                                  : it.detail ||
                                    it.series
                                      .map((x) => g.world.championships[x]?.name || x)
                                      .slice(0, 2)
                                      .join(' · ')}
                              </small>
                            </div>
                            <span className="st-directory-access">
                              <Icon name={it.internal ? 'LockKeyhole' : 'Globe2'} size={12} />
                              {it.internal ? 'Организация' : 'Публичный реестр'}
                            </span>
                            <label className="st-compare-check">
                              <input
                                type="checkbox"
                                aria-label={'Сравнить ' + it.name}
                                checked={s.compare.includes(it.type + ':' + it.id)}
                                onChange={() => toggleCompare(it)}
                              />
                              <span>Сравнить</span>
                            </label>
                          </div>
                        ))}
                      </div>
                      <div className="st-pagination">
                        <span>
                          {page * 12 + 1}–{Math.min(page * 12 + 12, filtered.length)} из{' '}
                          {count(filtered.length)}
                        </span>
                        <div>
                          <button
                            type="button"
                            disabled={page === 0}
                            onClick={() =>
                              set({
                                page: page - 1,
                              })
                            }
                          >
                            <Icon name="ChevronLeft" size={16} />
                            Назад
                          </button>
                          <span>
                            {page + 1} / {Math.ceil(filtered.length / 12)}
                          </span>
                          <button
                            type="button"
                            disabled={(page + 1) * 12 >= filtered.length}
                            onClick={() =>
                              set({
                                page: page + 1,
                              })
                            }
                          >
                            Далее
                            <Icon name="ChevronRight" size={16} />
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <Missing
                      title="Ничего не найдено по этим условиям"
                      text="Измените запрос, чемпионат, организацию или класс. Неизвестные данные не подменяются нулевыми результатами."
                      compact
                    />
                  )}
                  {cat === 'academies' && (
                    <Source internal>
                      Каталог академий ограничен академиями, которые доступны активной карьере. Полный
                      публичный международный реестр пока не предоставлен источником.
                    </Source>
                  )}
                  {cat === 'sponsors' && (
                    <Source internal>
                      Число соглашений относится к вашей организации. Оно не является числом партнёрств
                      бренда во всём мире.
                    </Source>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
      {compare.length > 0 && cat !== 'compare' && (
        <div className="st-compare-tray">
          <div>
            <Icon name="GitCompareArrows" size={18} />
            <span>
              <strong>{compare.length} / 3</strong>
              <small>{compare.map((x) => x.name).join(' · ')}</small>
            </span>
          </div>
          <button
            className="st-tray-clear"
            onClick={() =>
              set({
                compare: [],
              })
            }
            aria-label="Очистить сравнение"
          >
            <Icon name="X" size={17} />
          </button>
          <Button onClick={showCompare} disabled={compare.length < 2}>
            Сравнить
            <Icon name="ArrowRight" size={15} />
          </Button>
        </div>
      )}
      {selectedFact && (
        <FactDrawer
          fact={selectedFact}
          g={g}
          index={index}
          open={open}
          close={() => setSelectedFact(null)}
        />
      )}
    </div>
  )
}
function Overview({ index, g, mode, go, open, onDemo }) {
  const own =
      index.lookup[(g.role === 'manufacturer' ? 'manufacturers' : 'teams') + ':' + g.game.career.org],
    firstChamp = index.lookup['championships:' + g.game.career.series]
  const next = index.events
    .filter((e) => e.kind === 'round' && e.start >= g.game.career.date)
    .sort((a, b) => a.start.localeCompare(b.start))[0]
  const counts = index.byType.championships
    .map((c) => ({
      id: c.id,
      label: c.name.replace('Formula ', 'F'),
      value: c.entries.length,
    }))
    .sort((a, b) => b.value - a.value)
  const activeIds = uniq(
    index.entries
      .filter((e) => e.org === g.game.career.org && e.championship === g.game.career.series)
      .flatMap((e) => e.crew),
  )
  const featured = activeIds
      .map((id) => index.lookup['drivers:' + id])
      .filter(Boolean)
      .slice(0, 2),
    hasPeople = featured.length > 0
  return (
    <div className="st-overview">
      <div className="st-overview-editorial">
        <div className="st-overview-lead">
          <span className="st-kicker">ВАША КАРЬЕРА — ЧАСТЬ БОЛЬШЕГО МИРА</span>
          <h2>
            У каждого результата
            <br />
            есть история.
          </h2>
          <p>
            Следите за людьми, изучайте соперников и возвращайтесь к решениям, которые изменили сезон.
            Начните с собственной организации — или отправляйтесь дальше.
          </p>
          {own && (
            <button className="st-outline-button" type="button" onClick={() => open(own)}>
              Исследовать {own.name}
              <Icon name="ArrowUpRight" size={16} />
            </button>
          )}
          <div className="st-editorial-rule" />
          <div className="st-editorial-status">
            <Icon name={'CalendarClock'} size={18} />
            <div>
              <strong>{'Сезон 2025 ещё не написал свою историю'}</strong>
              <p>
                {
                  'В текущем снимке есть назначения, лицензии и календарь. Завершённых гоночных сессий в источнике пока нет.'
                }
              </p>
            </div>
          </div>
        </div>
        <div className="st-overview-spotlight">
          <div className="st-spotlight-title">
            <span className="st-kicker">{hasPeople ? 'ЛЮДИ ВАШЕЙ КОМАНДЫ' : 'ВАША ОРГАНИЗАЦИЯ'}</span>
            <Icon name="ArrowUpRight" size={19} />
          </div>
          {hasPeople ? (
            <div className="st-spotlight-people">
              {featured.map((p) => (
                <button type="button" key={p.id} onClick={() => open(p)}>
                  <PersonPortrait id={p.id} size={110} />
                  <small>{index.country(p.country)}</small>
                  <strong>{p.name}</strong>
                  <span>
                    Карьерный профиль
                    <Icon name="ArrowRight" size={12} />
                  </span>
                </button>
              ))}
            </div>
          ) : (
            own && (
              <button type="button" className="st-maker-spotlight" onClick={() => open(own)}>
                <Mark item={own} size={108} />
                <h3>{own.name}</h3>
                <p>{own.detail}</p>
                <span>{own.count} организаций используют продукцию в заявках</span>
              </button>
            )
          )}
          <div className="st-spotlight-caption">
            <span>ИЗ ИГРОВОГО МИРА</span>
            <strong>Профили связаны с текущей карьерой</strong>
          </div>
        </div>
      </div>
      <div className="st-overview-second">
        <DataChart
          type="comparison"
          title="Масштаб стартовой сетки"
          description="Число зарегистрированных заявок в 11 чемпионатах на начало карьеры."
          rows={counts}
          unit="заявок"
          height={375}
          source="world.entries · сезон 2025"
          note="Заявка не равна пилоту: в гонках на выносливость один экипаж включает несколько человек. Это состав сетки, не результаты."
          onSelect={(r) => open(index.lookup['championships:' + r.id])}
        />
        <section className="st-world-next">
          <span className="st-kicker">СВЯЗИ, КОТОРЫЕ МОЖНО ИССЛЕДОВАТЬ</span>
          <h3>
            Один мир.
            <br />
            Множество точек зрения.
          </h3>
          {next && (
            <button type="button" onClick={() => open(index.lookup['circuits:' + next.track_id])}>
              <Icon name="MapPin" size={19} />
              <span>
                <small>Ближайший этап мирового календаря</small>
                <strong>{next.name}</strong>
                <em>
                  {dateLabel(next.start)} · {next.circuit}
                </em>
              </span>
              <Icon name="ArrowUpRight" size={15} />
            </button>
          )}
          {firstChamp && (
            <button type="button" onClick={() => open(firstChamp)}>
              <Icon name="Trophy" size={19} />
              <span>
                <small>Ваш чемпионат</small>
                <strong>{firstChamp.name}</strong>
                <em>
                  {firstChamp.entries.length} заявок · правила {firstChamp.rules.rules_id}
                </em>
              </span>
              <Icon name="ArrowUpRight" size={15} />
            </button>
          )}
          <button type="button" onClick={() => go('countries')}>
            <Icon name="Globe2" size={19} />
            <span>
              <small>География автоспорта</small>
              <strong>{index.byType.countries.length} стран представлено</strong>
              <em>Люди, команды, производители и трассы</em>
            </span>
            <Icon name="ArrowRight" size={15} />
          </button>
        </section>
      </div>
      <section className="st-explore">
        <div className="st-section-heading">
          <div>
            <span className="st-kicker">ВСЯ ЭНЦИКЛОПЕДИЯ</span>
            <h2>Выберите, чью историю открыть</h2>
          </div>
        </div>
        <div className="st-explore-links">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => go(c.id)}>
              <Icon name={c.icon} size={23} />
              <span>
                <strong>{c.label}</strong>
                <small>{count(index.byType[c.id].length)} профилей в доступном реестре</small>
              </span>
              <Icon name="ArrowUpRight" size={16} />
            </button>
          ))}
        </div>
      </section>
      <div className="st-archive-strip">
        <div>
          <Icon name="Archive" size={25} />
          <span>
            <strong>Архив результатов</strong>
            <small>{'Завершённые сессии ещё не поступали. История назначений уже доступна.'}</small>
          </span>
        </div>
        {null}
      </div>
      <Source>
        Срез карьеры · {dateLabel(g.game.career.date)}. Реальная предыстория приводится отдельно, с
        источником. Публичный справочник не раскрывает внутренние показатели соперников.
      </Source>
    </div>
  )
}
function Profile({
  item,
  index,
  g,
  mode,
  tab,
  setTab,
  open,
  back,
  onDemo,
  period,
  setPeriod,
  compare,
  toggleCompare,
  go,
  onFact,
}) {
  const [relationLimit, setRelationLimit] = useState(8)
  useEffect(() => setRelationLimit(8), [item.id])
  const isPerson = item.type === 'drivers' || item.type === 'staff'
  const own = item.org === g.game.career.org
  const d = isPerson ? g.game.dossiers?.[item.id] : null
  const facts = (isPerson ? index.factsByPerson[item.id] : index.factsByOrg[item.id]) || []
  const rows = profileRows(item, index, g)
  const relations = useMemo(() => getRelations(item, index), [item, index])
  const tabs = [
    {
      id: 'overview',
      label: 'Профиль',
    },
    {
      id: 'history',
      label: 'История',
    },
    {
      id: 'results',
      label: item.type === 'staff' ? 'Работа и достижения' : 'Результаты и анализ',
    },
    {
      id: 'connections',
      label: 'Связи',
      count: relations.length,
    },
  ]
  const selected = compare.some((x) => x.id === item.id && x.type === item.type)
  return (
    <article className="st-profile">
      <div className="st-breadcrumb">
        <button onClick={back}>
          <Icon name="ArrowLeft" size={15} />
          {category(item.type)?.label}
        </button>
        <span>/</span>
        <span>{item.name}</span>
      </div>
      <header
        className={'st-profile-hero ' + item.type}
        style={{
          '--entity-color': item.color || index.orgs[item.org]?.color || '#4dc9b0',
        }}
      >
        <div className="st-profile-stripe" />
        <div className="st-profile-identity">
          <Mark item={item} size={isPerson ? 125 : 94} />
          <div>
            <span className="st-kicker">
              {category(item.type)?.singular.toUpperCase()} / {item.country || 'WORLD'}
            </span>
            <h2>{item.name}</h2>
            <p>{item.meta}</p>
            <div className="st-profile-tags">
              {item.series.slice(0, 5).map((s) => (
                <button type="button" key={s} onClick={() => open(index.lookup['championships:' + s])}>
                  {g.world.championships[s]?.name || s}
                  <Icon name="ArrowUpRight" size={11} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="st-profile-actions">
          <button
            type="button"
            className={'st-outline-button ' + (selected ? 'selected' : '')}
            aria-pressed={selected}
            onClick={() => toggleCompare(item)}
          >
            <Icon name={selected ? 'Check' : 'GitCompareArrows'} size={16} />
            {selected ? 'В сравнении' : 'Сравнить'}
          </button>
          {isPerson && (
            <button type="button" className="st-text-link" onClick={() => g.openPerson(item.id)}>
              Открыть кадровое досье
              <Icon name="ArrowUpRight" size={13} />
            </button>
          )}
          {(item.type === 'teams' || item.type === 'manufacturers') && own && (
            <button type="button" className="st-text-link" onClick={() => g.navigate('overview')}>
              В кабинет организации
              <Icon name="ArrowRight" size={13} />
            </button>
          )}
        </div>
      </header>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === 'overview' && (
        <>
          <div className="st-profile-grid">
            <section className="st-profile-dossier">
              <div className="st-section-heading">
                <div>
                  <span className="st-kicker">ПОДТВЕРЖДЁННЫЕ СВЕДЕНИЯ</span>
                  <h3>{isPerson ? 'Карьерное досье' : 'Паспорт профиля'}</h3>
                </div>
                <Icon name="Fingerprint" size={20} />
              </div>
              <dl>
                {rows.map(([key, value]) => (
                  <div key={key}>
                    <dt>{key}</dt>
                    <dd>
                      {value && typeof value === 'object' ? (
                        <button
                          type="button"
                          className="st-text-link"
                          onClick={() => open(index.lookup[value.type + ':' + value.id])}
                        >
                          {value.label}
                          <Icon name="ArrowUpRight" size={12} />
                        </button>
                      ) : (
                        value || 'Не указано'
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              <Source internal={item.internal}>{item.source}</Source>
            </section>
            <section className="st-profile-context">
              <ContextPanel
                item={item}
                index={index}
                g={g}
                mode={mode}
                open={open}
                showResults={() => setTab('results')}
              />
            </section>
          </div>
          {item.type === 'vehicles' && (
            <div className="st-car-showroom">
              <RaceCar entryId={item.entry.id} />
              <div>
                <span className="st-kicker">АВТОМОБИЛЬ ИЗ ТЕКУЩЕЙ ЗАЯВКИ</span>
                <h3>{item.name}</h3>
                <p>
                  Геометрия и ливрея визуального каталога. Изображение не является подтверждением
                  аэродинамических или динамических характеристик.
                </p>
                {own && g.role === 'manager' && (
                  <button
                    className="st-text-link"
                    onClick={() => {
                      g.setSelectedEntry?.(item.entry.id)
                      g.navigate('garage')
                    }}
                  >
                    Открыть гараж
                    <Icon name="ArrowRight" size={15} />
                  </button>
                )}
              </div>
            </div>
          )}
          {own && isPerson && d?.person?.skills && (
            <DataChart
              type="comparison"
              title="Навыки, доступные вашей организации"
              description="Текущий снимок досье. История изменения навыков не восстанавливается задним числом."
              rows={Object.entries(d.person.skills).map(([label, value]) => ({
                label,
                value,
              }))}
              unit="баллов навыка / 100"
              height={Math.max(250, Object.keys(d.person.skills).length * 29)}
              source="personnel dossier · активная организация"
              note="Это отдельные существующие навыки симуляции, не новый универсальный рейтинг. Для чужих специалистов скрытые характеристики не показываются."
            />
          )}
          <div className="st-related-preview">
            <div className="st-section-heading">
              <div>
                <span className="st-kicker">ПРОДОЛЖИТЬ ИССЛЕДОВАНИЕ</span>
                <h3>Связанные профили</h3>
              </div>
              <button type="button" className="st-text-link" onClick={() => setTab('connections')}>
                Все связи ({relations.length})
                <Icon name="ArrowRight" size={14} />
              </button>
            </div>
            <div className="st-related-grid">
              {relations.slice(0, 4).map((r) => (
                <EntityButton key={r.type + r.id} item={r} open={open} />
              ))}
              {!relations.length && (
                <p className="st-muted">Подтверждённые связи пока не опубликованы.</p>
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'history' && (
        <>
          <div className="st-section-heading">
            <div>
              <span className="st-kicker">ИСТОРИЯ ПРОФИЛЯ</span>
              <h3>{'Только подтверждённые события'}</h3>
              <p>
                {item.type === 'staff'
                  ? 'Назначение в команду само по себе не подтверждает авторство проекта или спортивного результата.'
                  : 'Стабильный профиль сохраняется после переходов, изменения названия и завершения карьеры.'}
              </p>
            </div>
          </div>
          {facts.length ? (
            <div className="st-timeline">
              {facts.slice(0, 25).map((f, i) => (
                <div key={f.key || i}>
                  <time>{dateLabel(f.day)}</time>
                  <section>
                    <span>{f.origin === 'initial' ? 'ИСХОДНОЕ СОСТОЯНИЕ МИРА' : 'СОБЫТИЕ КАРЬЕРЫ'}</span>
                    <h4>{FACT_KINDS[f.kind] || f.kind}</h4>
                    <p>{factSummary(f, index)}</p>
                    <button type="button" className="st-text-link" onClick={() => onFact(f)}>
                      Посмотреть источник
                      <Icon name="ArrowUpRight" size={13} />
                    </button>
                  </section>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="st-timeline">
                <div>
                  <time>2025</time>
                  <section>
                    <span>КАТАЛОГ МИРА</span>
                    <h4>Профиль доступен на начало карьеры</h4>
                    <p>{item.name}. Более ранние события не восстановлены из предположений.</p>
                  </section>
                </div>
              </div>
              <Missing
                title="Архив изменений ещё не подключён"
                text="В этом снимке нет полной истории переименований, поколений, партнёрств и переходов. Начальная запись не означает год основания."
                compact
              />
            </>
          )}
          {item.type === 'championships' && item.rules.previous_season?.fact && (
            <aside className="st-history-real">
              <Icon name="BookOpen" size={21} />
              <div>
                <span className="st-kicker">РЕАЛЬНАЯ ПРЕДЫСТОРИЯ / ДО ИГРЫ</span>
                <h4>2024 · отдельно от результатов вашей карьеры</h4>
                <p>{item.rules.previous_season.fact}</p>
                {item.rules.previous_season.source && (
                  <a href={item.rules.previous_season.source} target="_blank" rel="noreferrer">
                    Источник предыстории
                    <Icon name="ExternalLink" size={12} />
                  </a>
                )}
                <small>Эти достижения не приписываются сгенерированным пилотам и сотрудникам.</small>
              </div>
            </aside>
          )}
        </>
      )}
      {tab === 'results' && <>{<ActualAnalysis item={item} index={index} g={g} open={open} />}</>}
      {tab === 'connections' && (
        <>
          <div className="st-section-heading">
            <div>
              <span className="st-kicker">ПОДТВЕРЖДЁННЫЕ СВЯЗИ / {relations.length}</span>
              <h3>Люди, организации и техника</h3>
              <p>Переход открывает связанный профиль. Фильтры реестра сохраняются.</p>
            </div>
          </div>
          <div className="st-connections">
            {relations.slice(0, relationLimit).map((r) => (
              <EntityButton key={r.type + r.id} item={r} open={open} />
            ))}
            {!relations.length && (
              <Missing
                title="Публичные связи пока не указаны"
                text="Когда источник предоставит назначения, партнёрства или результаты, они будут связаны с этим профилем по стабильному идентификатору."
                compact
              />
            )}
          </div>
          {relations.length > relationLimit && (
            <button
              className="st-outline-button st-load-more"
              type="button"
              onClick={() => setRelationLimit(relationLimit + 12)}
            >
              Показать ещё {Math.min(12, relations.length - relationLimit)} связей
              <Icon name="ChevronDown" size={15} />
            </button>
          )}
        </>
      )}
    </article>
  )
}
function ContextPanel({ item, index, g, mode, onDemo, open, showResults }) {
  if (item.type === 'circuits')
    return (
      <>
        <div className="st-track-map-missing">
          <Icon name="MapPinned" size={43} />
          <span className="st-kicker">ГЕОМЕТРИЯ КОНФИГУРАЦИИ</span>
          <h3>Карта не предоставлена источником</h3>
          <p>
            Календарное название не определяет длину и траекторию. Достоверная карта появится из модели
            трасс; вымышленный контур не используется.
          </p>
          <span>track_id / {item.id}</span>
        </div>
        <div className="st-mini-agenda">
          {item.events.slice(0, 3).map((e) => (
            <button key={e.id} onClick={() => g.navigate('calendar', e.series, e.id)}>
              <time>{dateLabel(e.start)}</time>
              <span>
                {e.name}
                <small>{g.world.championships[e.series]?.name}</small>
              </span>
              <Icon name="ArrowUpRight" size={13} />
            </button>
          ))}
        </div>
      </>
    )
  if (item.type === 'championships')
    return (
      <>
        <div className="st-regulation-card">
          <Icon name="BookOpenCheck" size={28} />
          <span className="st-kicker">АКТУАЛЬНЫЙ РЕГЛАМЕНТ</span>
          <h3>{item.rules.name}</h3>
          <div className="st-points-system">
            {(item.rules.points?.race || []).slice(0, 10).map((v, i) => (
              <div key={i}>
                <small>P{i + 1}</small>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
          <p>Очки за гонку · версия {item.rules.rules_id}. Спринты и классы учитываются отдельно.</p>
          <button className="st-text-link" onClick={() => g.navigate('world', item.id)}>
            Открыть регламент и сезон
            <Icon name="ArrowRight" size={14} />
          </button>
        </div>
      </>
    )
  if (item.type === 'manufacturers')
    return (
      <>
        <span className="st-kicker">ПУБЛИЧНЫЙ РЫНОЧНЫЙ СЛЕД</span>
        <div className="st-context-number">
          <strong>{item.count}</strong>
          <span>
            организаций-клиентов
            <br />в стартовых заявках
          </span>
        </div>
        <p className="st-context-body">
          Связи рассчитаны по поставщикам указанных автомобилей. Это не рыночная доля по выручке и не
          оценка качества продукта.
        </p>
        <button className="st-outline-button" onClick={showResults}>
          Исследовать поставки
          <Icon name="ArrowRight" size={14} />
        </button>
        <Source>world.entries → world.cars.suppliers · 2025</Source>
      </>
    )
  if (item.type === 'countries')
    return (
      <>
        <span className="st-kicker">ПРЕДСТАВИТЕЛЬСТВО В МИРЕ</span>
        <div className="st-country-code">{item.id}</div>
        <p className="st-context-body">
          {item.name} представлена {count(item.persons.length)} людьми и{' '}
          {item.teams.length + item.makers.length} организациями в доступном каталоге.
        </p>
        <button className="st-outline-button" onClick={showResults}>
          Посмотреть структуру
          <Icon name="ArrowRight" size={14} />
        </button>
      </>
    )
  if (item.type === 'vehicles')
    return (
      <>
        <span className="st-kicker">ТЕХНИЧЕСКАЯ РОДОСЛОВНАЯ</span>
        <h3>Партнёры автомобиля</h3>
        <div className="st-supplier-lines">
          {Object.entries(item.car.suppliers || {}).map(([axis, id]) => (
            <button key={axis} type="button" onClick={() => open(index.lookup['manufacturers:' + id])}>
              <span>{AXIS_NAMES[axis] || axis}</span>
              <strong>{index.orgName(id)}</strong>
              <Icon name="ArrowUpRight" size={13} />
            </button>
          ))}
        </div>
      </>
    )
  if (item.type === 'academies')
    return (
      <>
        <span className="st-kicker">ПУТЬ В АВТОСПОРТ</span>
        <div className="st-context-number">
          <strong>{item.count}</strong>
          <span>
            воспитанников
            <br />с действующим соглашением
          </span>
        </div>
        <p className="st-context-body">
          Прогресс академии — карьеры её воспитанников. До появления завершённых сезонов число
          выпускников и достижений не выдумывается.
        </p>
        <button className="st-outline-button" onClick={() => g.navigate('academy')}>
          К управлению академией
          <Icon name="ArrowRight" size={14} />
        </button>
      </>
    )
  if (item.type === 'sponsors')
    return (
      <>
        <span className="st-kicker">КОММЕРЧЕСКОЕ ПРИСУТСТВИЕ</span>
        <h3>{item.agreements.length ? 'Подтверждённые соглашения' : 'Бренд доступен на рынке'}</h3>
        <p className="st-context-body">
          {item.agreements.length
            ? item.agreements.length +
              ' соглашений в активной карьере. Глобальная история спонсорства не предоставлена источником.'
            : 'Ваша организация пока не имеет действующего соглашения с этим брендом. Наличие в каталоге не означает заключённое партнёрство.'}
        </p>
        <button className="st-outline-button" onClick={() => g.navigate('sponsors')}>
          Коммерческий отдел
          <Icon name="ArrowRight" size={14} />
        </button>
      </>
    )
  return (
    <Missing
      title={
        item.type === 'staff'
          ? 'Подтверждение участия важнее громких титулов'
          : 'История результатов ещё впереди'
      }
      text={
        item.type === 'staff'
          ? 'Пока доступны назначения. Проекты, вклад и достижения появятся только при наличии связанного события, периода и роли.'
          : 'В текущем снимке нет завершённых сессий. Победы, подиумы и титулы не заменяются вымышленными числами.'
      }
      compact
    />
  )
}
function ActualAnalysis({ item, index, g, open, onDemo }) {
  const own = item.org === g.game.career.org
  if (item.type === 'countries') {
    const rows = [
      {
        label: 'Пилоты',
        value: item.count,
      },
      {
        label: 'Персонал',
        value: item.persons.filter((p) => p.type === 'staff').length,
      },
      {
        label: 'Команды',
        value: item.teams.length,
      },
      {
        label: 'Производители',
        value: item.makers.length,
      },
      {
        label: 'Трассы',
        value: item.circuits.length,
      },
    ]
    return (
      <>
        <DataChart
          type="bar"
          title={'Представительство · ' + item.name}
          description="Текущий состав доступного мира, не спортивные достижения страны."
          rows={rows}
          unit="записей"
          source="Каталог людей, организаций и календарных трасс · 2025"
          note="Гражданство человека и страна организации — разные категории. Значения не суммируются в универсальный рейтинг страны."
        />
        <div className="st-country-detail">
          <strong>
            {item.count} / {index.byType.drivers.length}
          </strong>
          <p>
            Пилотов этой страны среди {index.byType.drivers.length} пилотов, доступных в текущем кадровом
            справочнике: {((item.count / Math.max(1, index.byType.drivers.length)) * 100).toFixed(1)}
            %. Это представительство, а не доля побед.
          </p>
        </div>
        <Missing
          title="Архив национальных достижений пока пуст"
          text="Победы, титулы и рекорды стран будут рассчитаны по завершённым классификациям, с указанным сезоном и чемпионатом."
          compact
        />
      </>
    )
  }
  if (item.type === 'manufacturers') {
    const rows = item.series.map((id) => ({
      id,
      label: g.world.championships[id]?.name || id,
      value: item.entries.filter((e) => e.championship === id).length,
    }))
    return (
      <>
        <DataChart
          type="bar"
          title="Присутствие продукции в заявках"
          description="Состав стартовых сеток 2025 года. Один автомобиль учитывается один раз в пределах серии."
          rows={rows}
          unit="заявок"
          source="world.entries → cars.suppliers"
          note={
            'Связано ' +
            item.entries.length +
            ' заявок. Полная выручка, объёмы продаж и скрытые характеристики конкурентов недоступны.'
          }
          onSelect={(r) => open(index.lookup['championships:' + r.id])}
        />
        <Missing
          title="История надёжности ещё не поступала"
          text="Пока нет подтверждённого пробега, причин отказов и числа экземпляров под наблюдением. Доля присутствия в заявках не заменяет долю рынка по продажам."
          compact
        />
      </>
    )
  }
  if (item.type === 'teams' || item.type === 'championships') {
    const groups = item.type === 'teams' ? item.series : item.rules.classes
    const rows = groups.map((k) => ({
      id: k,
      label: item.type === 'teams' ? g.world.championships[k]?.name || k : k,
      value: item.entries.filter((e) =>
        item.type === 'teams' ? e.championship === k : e.category === k,
      ).length,
    }))
    return (
      <>
        <DataChart
          type="bar"
          title={item.type === 'teams' ? 'Гоночные программы организации' : 'Заявки по классам'}
          rows={rows}
          unit="заявок"
          source="Публичный реестр заявок · 2025"
          note="Участник календаря ещё не является стартовавшим в гонке. История результатов будет иметь отдельный источник."
          onSelect={
            item.type === 'teams' ? (r) => open(index.lookup['championships:' + r.id]) : undefined
          }
        />
        <Missing />
      </>
    )
  }
  if (item.type === 'academies')
    return (
      <>
        <div className="st-academy-roster">
          {item.scholarships.map((s) => {
            const p = index.lookup['drivers:' + s.person]
            return (
              p && (
                <div key={s.id}>
                  <EntityButton item={p} open={open} />
                  <span>До {dateLabel(s.end)}</span>
                  <Badge>{s.option ? 'Опцион' : 'Соглашение'}</Badge>
                </div>
              )
            )
          })}
        </div>
        <Missing
          title="Карьерные траектории ещё формируются"
          text="Источники знают действующие соглашения, но не подтверждённые выпуски, достижения и историю роста. Возраст не используется как замена прогрессу."
          compact
        />
      </>
    )
  if (item.type === 'vehicles' && own) {
    return (
      <Missing
        title="Нужны сопоставимые инженерные наблюдения"
        text="Известны поколение, регламент и поставщики. Источник статистического центра пока не содержит временного ряда характеристик, результатов и отказов этой машины. Собственные параметры доступны в инженерном отделе."
      />
    )
  }
  if (item.type === 'sponsors')
    return (
      <>
        <div className="st-sponsor-agreements">
          {item.agreements.map((a) => (
            <div key={a.id}>
              <Icon name="FileSignature" size={20} />
              <div>
                <strong>{index.orgName(a.org)}</strong>
                <span>
                  {dateLabel(a.start)} — {dateLabel(a.end)}
                </span>
                <small>
                  {a.role === 'academy'
                    ? 'Программа академии'
                    : a.role === 'driver'
                      ? 'Пилотская программа'
                      : 'Коммерческое соглашение'}
                </small>
              </div>
              <Badge tone="positive">Подписано</Badge>
            </div>
          ))}
        </div>
        <Missing
          title="История партнёрств ещё не собрана"
          text="Показаны только известные подписанные договоры текущей организации. Даты начала этих договоров не заменяют публичную историю бренда во всём автоспорте."
          compact
        />
      </>
    )
  return (
    <Missing
      title={
        item.type === 'staff'
          ? 'Нет подтверждённых проектов и личных достижений'
          : 'Результаты симуляции ещё не доступны'
      }
      text={
        item.type === 'staff'
          ? 'Публичные назначения доступны в истории. Для показа авторства, вклада и динамики навыков нужен специализированный источник #39. Все достижения команды не будут приписаны каждому сотруднику.'
          : 'Классификации, квалификации, круги, рекорды и развитие по сезонам появятся после подключения соответствующих источников. Отсутствие результата не означает ноль побед или последнее место.'
      }
    />
  )
}
function getRelations(item, index) {
  const get = (type, id) => index.lookup[type + ':' + id],
    out = []
  if (item.org && item.type !== 'teams' && item.type !== 'manufacturers')
    out.push(get(index.orgs[item.org]?.kind === 'team' ? 'teams' : 'manufacturers', item.org))
  item.series.forEach((s) => out.push(get('championships', s)))
  if (item.country && item.type !== 'countries') out.push(get('countries', item.country))
  if (item.type === 'drivers' || item.type === 'staff') {
    index.entries
      .filter((e) => e.crew.includes(item.id))
      .forEach((e) => out.push(get('vehicles', e.car)))
    index.byType.academies
      .filter((a) => a.scholarships.some((s) => s.person === item.id))
      .forEach((a) => out.push(a))
  }
  if (item.type === 'teams') {
    item.people.forEach((p) => out.push(get(p.position === 'driver' ? 'drivers' : 'staff', p.id)))
    item.entries.forEach((e) => {
      out.push(get('vehicles', e.car))
      Object.values(index.cars[e.car]?.suppliers || {}).forEach((id) =>
        out.push(get('manufacturers', id)),
      )
    })
  }
  if (item.type === 'manufacturers')
    item.entries.forEach((e) => {
      out.push(get('teams', e.org))
      out.push(get('vehicles', e.car))
    })
  if (item.type === 'championships')
    item.entries.forEach((e) => {
      out.push(get('teams', e.org))
      e.crew.forEach((id) => out.push(get('drivers', id)))
    })
  if (item.type === 'vehicles') {
    item.entry.crew.forEach((id) => out.push(get('drivers', id)))
    Object.values(item.car.suppliers || {}).forEach((id) => out.push(get('manufacturers', id)))
  }
  if (item.type === 'academies') item.scholarships.forEach((s) => out.push(get('drivers', s.person)))
  if (item.type === 'countries')
    out.push(...item.persons, ...item.teams, ...item.makers, ...item.circuits)
  if (item.type === 'sponsors')
    item.agreements.forEach((a) => {
      out.push(get('teams', a.org))
      if (a.person) out.push(get('drivers', a.person))
      if (a.academy) out.push(get('academies', a.academy))
    })
  return [
    ...new Map(
      out
        .filter((x) => x && !(x.id === item.id && x.type === item.type))
        .map((x) => [x.type + ':' + x.id, x]),
    ).values(),
  ]
}
function CompareView({ items, index, g, mode, open, remove, back, onDemo }) {
  const [metric, setMetric] = useState('absolute')
  if (items.length < 2)
    return (
      <>
        <div className="st-breadcrumb">
          <button onClick={back}>
            <Icon name="ArrowLeft" size={15} />К реестру
          </button>
        </div>
        <Missing
          title="Выберите два или три профиля"
          text="В реестре отметьте профили одного типа. Сравнение сохраняется при открытии связанных сущностей."
          compact
        />
      </>
    )
  const type = items[0].type,
    publicRows = [
      ['Страна', ...items.map((x) => index.country(x.country))],
      ['Контекст', ...items.map((x) => x.meta)],
      [
        'Чемпионаты',
        ...items.map((x) => x.series.map((s) => g.world.championships[s]?.name).join(', ')),
      ],
    ]
  if (['drivers', 'staff'].includes(type))
    publicRows.push(
      ['Возраст, лет', ...items.map((x) => x.age ?? 'Нет данных')],
      ['Специализация', ...items.map((x) => x.detail || 'Не указана')],
    )
  if (['teams', 'manufacturers'].includes(type))
    publicRows.push(['Заявки с участием', ...items.map((x) => x.entries.length)])
  if (type === 'circuits') publicRows.push(['Гоночных этапов в календаре', ...items.map((x) => x.count)])
  if (type === 'vehicles')
    publicRows.push(
      ['Поколение', ...items.map((x) => x.car.generation)],
      ['Регламент', ...items.map((x) => x.car.regulation)],
    )
  const series = items.map((it, i) => ({
    key: 'value' + i,
    label: it.name,
    color: ['#dd9e71', '#9cb6d1', '#8baaf5'][i],
  }))
  return (
    <section className="st-compare-view">
      <div className="st-breadcrumb">
        <button onClick={back}>
          <Icon name="ArrowLeft" size={15} />
          {category(type)?.label}
        </button>
        <span>/ Сравнение</span>
      </div>
      <div className="st-section-heading">
        <div>
          <span className="st-kicker">СОПОСТАВИМЫЕ ДАННЫЕ</span>
          <h2>Сравнение профилей</h2>
          <p>Одинаковый период, класс и единицы. Недоступный показатель остаётся недоступным.</p>
        </div>
      </div>
      <div className="st-compare-profiles">
        {items.map((it, i) => (
          <div
            key={it.id}
            style={{
              '--comparison-color': series[i].color,
            }}
          >
            <button
              className="st-compare-remove"
              aria-label={'Убрать ' + it.name}
              onClick={() => remove(it)}
            >
              <Icon name="X" size={16} />
            </button>
            <button type="button" className="st-compare-profile-link" onClick={() => open(it)}>
              <Mark item={it} size={70} />
              <h3>{it.name}</h3>
              <p>{it.meta}</p>
              <span>
                Открыть профиль
                <Icon name="ArrowUpRight" size={12} />
              </span>
            </button>
          </div>
        ))}
      </div>
      <div className="st-comparison-data" tabIndex="0" aria-label="Сравнительная таблица профилей">
        <table>
          <thead>
            <tr>
              <th>Публичные сведения</th>
              {items.map((x) => (
                <th key={x.id}>{x.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {publicRows.map(([label, ...values]) => (
              <tr key={label}>
                <th>{label}</th>
                {values.map((v, i) => (
                  <td key={i}>{v || 'Не указано'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {
        <Missing
          title="Спортивное сравнение ожидает исходных результатов"
          text="Возраст, число заявок и известные программы доступны. Результаты, темп, надёжность и скрытые навыки соперников нельзя вывести из этих полей."
        />
      }
      <Source>
        Публичный реестр мира. Сравнение разных классов, правил начисления очков и конфигураций требует
        явного приведения контекста.
      </Source>
    </section>
  )
}
function Journal({ index, g, s, set, openFact, open }) {
  const records = index.facts
    .filter(
      (f) =>
        (s.journalScope === 'all' || f.access === 'public') &&
        (!s.journalKind || f.kind === s.journalKind) &&
        (!s.query || factSummary(f, index).toLowerCase().includes(s.query.toLowerCase())),
    )
    .sort((a, b) => String(b.day).localeCompare(String(a.day)))
  const [p, setP] = useState(0)
  useEffect(() => setP(0), [s.journalScope, s.journalKind, s.query])
  const page = Math.min(p, Math.max(0, Math.ceil(records.length / 15) - 1))
  return (
    <section className="st-journal">
      <div className="st-section-heading">
        <div>
          <span className="st-kicker">ПОДТВЕРЖДЁННЫЕ СОБЫТИЯ</span>
          <h2>
            Журнал мира <span>{count(records.length)}</span>
          </h2>
          <p>
            Назначения, допуски и соглашения. Будущие обязательства показаны с датой исполнения; это не
            сыгранные события.
          </p>
        </div>
      </div>
      <div className="st-journal-filters">
        <label>
          <span>Поиск в событиях</span>
          <input
            value={s.query}
            onChange={(e) =>
              set({
                query: e.target.value,
              })
            }
            placeholder="Имя, команда, событие"
          />
        </label>
        <label>
          <span>Тип события</span>
          <select
            value={s.journalKind}
            onChange={(e) =>
              set({
                journalKind: e.target.value,
              })
            }
          >
            <option value="">Все типы</option>
            {uniq(index.facts.map((f) => f.kind)).map((k) => (
              <option key={k} value={k}>
                {FACT_KINDS[k] || k}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Доступ</span>
          <select
            value={s.journalScope}
            onChange={(e) =>
              set({
                journalScope: e.target.value,
              })
            }
          >
            <option value="public">Публичные события</option>
            <option value="all">+ Данные моей организации</option>
          </select>
        </label>
      </div>
      <div className="st-journal-list">
        {records.slice(page * 15, page * 15 + 15).map((f, i) => (
          <button key={f.key || i} type="button" onClick={() => openFact(f)}>
            <time>{dateLabel(String(f.day || '').slice(0, 10))}</time>
            <Icon name={f.access === 'public' ? 'Globe2' : 'LockKeyhole'} size={16} />
            <span>
              <strong>{FACT_KINDS[f.kind] || f.kind}</strong>
              <small>{factSummary(f, index)}</small>
            </span>
            <em>{f.origin === 'initial' ? 'Начало карьеры' : 'Симуляция'}</em>
            <Icon name="ChevronRight" size={15} />
          </button>
        ))}
      </div>
      {!records.length && (
        <Missing
          title="Событий по этим условиям нет"
          text="Измените тип события, строку поиска или доступ. Пустая выборка не означает отсутствие всей истории."
          compact
        />
      )}
      <div className="st-pagination">
        <span>
          {records.length ? `${page * 15 + 1}–${Math.min(page * 15 + 15, records.length)}` : '0'} из{' '}
          {count(records.length)}
        </span>
        <div>
          <button disabled={page === 0} onClick={() => setP(page - 1)}>
            <Icon name="ChevronLeft" size={14} />
            Назад
          </button>
          <button disabled={(page + 1) * 15 >= records.length} onClick={() => setP(page + 1)}>
            Далее
            <Icon name="ChevronRight" size={14} />
          </button>
        </div>
      </div>
      <Source internal={s.journalScope === 'all'}>
        projections.statistics.items · публичные события и разрешённые записи активной организации.
        Записи относятся к выбранному сохранению.
      </Source>
    </section>
  )
}
function factSummary(f, index) {
  const c = f.body?.context || {},
    d = f.body?.data || {}
  return (
    [
      c.person ? index.personMap[c.person]?.name || index.world.names[c.person] || c.person : '',
      c.org ? index.orgName(c.org) : '',
      c.series ? index.world.championships[c.series]?.name : '',
      d.position ? index.world.positions[d.position]?.name : '',
      d.licence ? d.licence : '',
      d.detail ? (typeof d.detail === 'string' ? d.detail : 'Локальное управленческое действие') : '',
    ]
      .filter(Boolean)
      .join(' · ') ||
    FACT_KINDS[f.kind] ||
    f.kind
  )
}
function FactDrawer({ fact, g, index, open, close }) {
  const [showTechnical, setTechnical] = useState(false)
  const c = fact.body?.context || {},
    d = fact.body?.data || {}
  const ref = React.useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    ref.current?.querySelector('button')?.focus()
    return () => prev?.focus?.()
  }, [])
  const labels = {
    end: 'Окончание',
    start: 'Начало',
    position: 'Должность',
    licence: 'Лицензия',
    issued: 'Выдана',
    expires: 'Действует до',
    due: 'Срок платежа',
    earned: 'Дата обязательства',
    status: 'Статус',
    amount_cents: 'Сумма',
    paid: 'Оплачено',
    reserved: 'Резервирование',
    category: 'Категория',
  }
  const profile = c.person
    ? index.lookup[
        (index.personMap[c.person]?.position === 'driver' ? 'drivers' : 'staff') + ':' + c.person
      ]
    : c.org
      ? index.lookup[(index.orgs[c.org]?.kind === 'team' ? 'teams' : 'manufacturers') + ':' + c.org]
      : null
  return (
    <div
      className="st-drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <section
        ref={ref}
        className="st-fact-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Источник события"
        onKeyDown={(e) => {
          if (e.key === 'Escape') close()
          if (e.key === 'Tab') {
            const f = [...ref.current.querySelectorAll('button,a,input,select,[tabindex="0"]')]
            if (e.shiftKey && document.activeElement === f[0]) {
              e.preventDefault()
              f.at(-1)?.focus()
            } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
              e.preventDefault()
              f[0]?.focus()
            }
          }
        }}
      >
        <header>
          <div>
            <span className="st-kicker">ИСТОЧНИК СОБЫТИЯ</span>
            <h3>{FACT_KINDS[fact.kind] || fact.kind}</h3>
          </div>
          <button type="button" aria-label="Закрыть источник события" onClick={close}>
            <Icon name="X" size={20} />
          </button>
        </header>
        <div className="st-fact-body">
          <p className="st-fact-date">{dateLabel(String(fact.day || '').slice(0, 10))}</p>
          <h4>{factSummary(fact, index)}</h4>
          <Source internal={fact.access !== 'public'}>
            {fact.access === 'public' ? 'Публичный факт мира' : 'Внутренние данные активной организации'}
          </Source>
          <dl>
            {Object.entries(d)
              .filter(([k]) => labels[k])
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{labels[k]}</dt>
                  <dd>
                    {k === 'amount_cents'
                      ? money(v)
                      : typeof v === 'boolean'
                        ? v
                          ? 'Да'
                          : 'Нет'
                        : v == null
                          ? 'Не наступило'
                          : k === 'position'
                            ? index.world.positions[v]?.name || v
                            : ['start', 'end', 'issued', 'expires', 'due', 'earned'].includes(k)
                              ? dateLabel(String(v).slice(0, 10))
                              : {
                                  sponsorship: 'Спонсорство',
                                  supply: 'Поставка',
                                  pending: 'Ожидает исполнения',
                                  paid: 'Исполнено',
                                  cancelled: 'Отменено',
                                  international: 'Международная',
                                  super: 'Суперлицензия',
                                }[String(v)] || String(v)}
                  </dd>
                </div>
              ))}
          </dl>
          {profile && (
            <EntityButton
              item={profile}
              open={(p) => {
                close()
                open(p)
              }}
            />
          )}
          <button
            className="st-text-link"
            type="button"
            onClick={() => setTechnical(!showTechnical)}
            aria-expanded={showTechnical}
          >
            Техническое происхождение
            <Icon name={showTechnical ? 'ChevronUp' : 'ChevronDown'} size={15} />
          </button>
          {showTechnical && (
            <div className="st-source-details">
              <p>Источник: {fact.source || 'журнал карьеры'}</p>
              <p>Тип: {fact.kind}</p>
              <p>Версия схемы: {fact.body?.version ?? 'не указана'}</p>
              <code>{fact.key || fact.id}</code>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
/** A compact statistics entry point for personnel / organization pages. */
export function EntityStatistics({ type, id }) {
  const g = useGame()
  const index = useMemo(
    () => buildStatisticsIndex(g),
    [g.world, g.game, g.data.media, g.game.career.date],
  )
  const [expanded, setExpanded] = useState(false)
  const normalized =
    {
      driver: 'drivers',
      person: 'drivers',
      personnel: 'staff',
      team: 'teams',
      organization: g.world.organizations[id]?.kind === 'team' ? 'teams' : 'manufacturers',
      manufacturer: 'manufacturers',
      track: 'circuits',
      championship: 'championships',
      car: 'vehicles',
      academy: 'academies',
      country: 'countries',
      sponsor: 'sponsors',
    }[type] || type
  const item = index.lookup[normalized + ':' + id]
  if (!item) return null
  const publicFacts = (
    (normalized === 'drivers' || normalized === 'staff'
      ? index.factsByPerson[id]
      : index.factsByOrg[id]) || []
  )
    .slice()
    .sort((a, b) => String(b.day).localeCompare(String(a.day)))
  const relations = getRelations(item, index),
    own = item.org === g.game.career.org,
    dossier = own ? g.game.dossiers?.[id] : null
  const open = (it) => g.navigate('statistics', it.type, it.type + ':' + it.id)
  const chronology = publicFacts.slice(0, expanded ? 20 : 6)
  const inspect = (f) =>
    g.openDialog({
      title: 'Подтверждённое событие · ' + (FACT_KINDS[f.kind] || f.kind),
      content: (
        <div className="st-demo-detail">
          <Source>
            Публичное событие · {f.origin === 'initial' ? 'исходное состояние мира' : 'история карьеры'}
          </Source>
          <h3>{factSummary(f, index)}</h3>
          <dl>
            <div>
              <dt>Дата записи</dt>
              <dd>{dateLabel(f.day)}</dd>
            </div>
            {f.body?.data?.end && (
              <div>
                <dt>Окончание</dt>
                <dd>{dateLabel(f.body.data.end)}</dd>
              </div>
            )}
            {f.body?.data?.licence && (
              <div>
                <dt>Допуск</dt>
                <dd>{f.body.data.licence}</dd>
              </div>
            )}
          </dl>
          <p>
            Событие подтверждает назначение или допуск. Оно не доказывает участие в победах команды и не
            заменяет протоколы выступлений.
          </p>
        </div>
      ),
    })
  return (
    <section className="st-embedded st-embedded-full">
      <header>
        <Icon name="History" size={24} />
        <div>
          <span className="st-kicker">СТАТИСТИКА И ИСТОРИЯ / ФАКТИЧЕСКИЙ СНИМОК</span>
          <h3>{item.name}</h3>
          <p>
            Публичные события и связи этого профиля. Источники будущих результатов подключаются отдельно.
          </p>
        </div>
      </header>
      <div className="st-embedded-columns">
        <section>
          <div className="st-embedded-subhead">
            <h4>Подтверждённая хронология</h4>
            <span>{publicFacts.length} записей</span>
          </div>
          {chronology.length ? (
            <div className="st-embedded-events">
              {chronology.map((f, i) => (
                <button type="button" key={f.key || i} onClick={() => inspect(f)}>
                  <time>{dateLabel(f.day)}</time>
                  <span>
                    <strong>{FACT_KINDS[f.kind] || f.kind}</strong>
                    <small>{factSummary(f, index)}</small>
                  </span>
                  <Icon name="ArrowUpRight" size={14} />
                </button>
              ))}
            </div>
          ) : (
            <p className="st-embedded-empty">
              В источнике ещё нет событий, связанных с этим профилем. Наличие в каталоге не означает
              подтверждённую карьерную историю.
            </p>
          )}
          {publicFacts.length > 6 && (
            <button
              type="button"
              className="st-text-link"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              {expanded ? 'Свернуть хронологию' : 'Показать ещё события'}
              <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={14} />
            </button>
          )}
        </section>
        <section>
          <div className="st-embedded-subhead">
            <h4>Подтверждённые связи</h4>
            <span>{relations.length} профилей</span>
          </div>
          {relations.slice(0, 6).map((r) => (
            <EntityButton key={r.type + r.id} item={r} open={open} small />
          ))}
          {!relations.length && (
            <p className="st-embedded-empty">Публичные связи пока не предоставлены.</p>
          )}
        </section>
      </div>
      {dossier?.person?.skills && (
        <DataChart
          type="comparison"
          title="Текущие навыки, доступные организации"
          rows={Object.entries(dossier.person.skills).map(([label, value]) => ({
            label,
            value,
          }))}
          unit="баллов навыка / 100"
          height={Math.max(250, Object.keys(dossier.person.skills).length * 29)}
          source="Досье сотрудника активной организации"
          note="Снимок доступных навыков, не ретроспективная динамика. Не раскрывает скрытые навыки конкурентов."
        />
      )}
      <div className="st-embedded-no-results">
        <Icon name="Archive" size={22} />
        <div>
          <h4>
            {normalized === 'staff'
              ? 'Проекты и достижения ожидают подтверждения'
              : 'Архив выступлений ещё не подключён'}
          </h4>
          <p>
            {normalized === 'staff'
              ? 'Назначение не подтверждает авторство проектов. Участие появится вместе с источником роли, периода и результата работы.'
              : 'В текущем снимке нет завершённых классификаций. Победы, подиумы, темп и рекорды не заменяются вымышленными цифрами.'}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="st-text-link"
        onClick={() => g.navigate('statistics', normalized, normalized + ':' + id)}
      >
        Продолжить исследование в центре мира
        <Icon name="ArrowUpRight" size={14} />
      </button>
    </section>
  )
}
export default StatisticsCenter
function WorldArchive({ view, index, g, mode, open, onDemo }) {
  const [archiveSeries, setArchiveSeries] = useState('f1'),
    [sort, setSort] = useState('points'),
    [relative, setRelative] = useState(false),
    [archiveSeason, setArchiveSeason] = useState('2027')
  const series = index.lookup['championships:' + archiveSeries]
  return (
    <section className="st-world-archive">
      <div className="st-section-heading">
        <div>
          <span className="st-kicker">ХРОНИКА ЕДИНОГО МИРА</span>
          <h2>
            {view === 'records' ? 'Рекорды и исторические рейтинги' : 'Архив сезонов и соревнований'}
          </h2>
          <p>
            {view === 'records'
              ? 'Каждый рекорд имеет контекст: дисциплину, класс, период, сессию и источник.'
              : 'Путь от сезона к чемпионату, участнику и конкретной сессии.'}
          </p>
        </div>
      </div>
      <div className="st-archive-controls">
        <label>
          <span>Чемпионат</span>
          <select value={archiveSeries} onChange={(e) => setArchiveSeries(e.target.value)}>
            {index.byType.championships.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Сезон</span>
          <select value={'2025'} onChange={(e) => setArchiveSeason(e.target.value)} disabled={true}>
            <option value={'2025'}>{'2025 · карьера'}</option>
          </select>
        </label>
        {view === 'records' && (
          <label>
            <span>Критерий</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="points">Очки</option>
              <option value="wins">Победы</option>
              <option value="podiums">Подиумы</option>
            </select>
          </label>
        )}
      </div>
      <div className="st-archive-series">
        <Mark item={series} size={62} />
        <div>
          <span className="st-kicker">
            {series.rules.discipline} / {series.rules.classes.join(', ')}
          </span>
          <h3>{series.name}</h3>
          <p>
            {series.entries.length} заявок в исходном мире ·{' '}
            {series.events.filter((e) => e.kind === 'round').length} этапов в календаре 2025
          </p>
        </div>
        <button type="button" className="st-text-link" onClick={() => open(series)}>
          Профиль чемпионата
          <Icon name="ArrowUpRight" size={13} />
        </button>
      </div>
      {
        <>
          <Missing
            title={
              view === 'records'
                ? 'Подтверждённых рекордов ещё нет'
                : 'Архив сессий ожидает первых результатов'
            }
            text="текущей карьеры предоставляет исходный мир, регламент, назначения и календарь. Классификации завершённых сессий, история кругов и спортивные рекорды пока не поступают. Ноль записей не интерпретируется как ноль достижений за всю карьеру."
          />
          {series.rules.previous_season?.fact && (
            <aside className="st-history-real">
              <Icon name="BookOpen" size={22} />
              <div>
                <span className="st-kicker">РЕАЛЬНАЯ ПРЕДЫСТОРИЯ / 2024</span>
                <h4>Справка из исходных данных</h4>
                <p>{series.rules.previous_season.fact}</p>
                <a href={series.rules.previous_season.source} target="_blank" rel="noreferrer">
                  Перейти к указанному источнику
                  <Icon name="ExternalLink" size={12} />
                </a>
                <small>Отделена от новой игры и не присваивается сгенерированным спортсменам.</small>
              </div>
            </aside>
          )}
        </>
      }
      <Source>
        Концепция задач #37–41. Расчёт реальной статистики, телеметрии и архивов остаётся обязанностью
        спортивных результатов.
      </Source>
    </section>
  )
}
