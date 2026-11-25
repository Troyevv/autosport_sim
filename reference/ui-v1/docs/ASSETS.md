# Ассеты интерфейса

## Изображения

Изображения созданы встроенным ImageGen специально для этого прототипа. Персонажи и команда вымышленные. Производные WebP сохранены локально в `dist/assets`; сетевые обращения за ассетами не требуются.

| Файл | Назначение | Бриф генерации |
|---|---|---|
| `hero.webp` | Художественная иллюстрация на экране штаба | Photorealistic cinematic widescreen Formula racing car in an almost black concrete garage, dark charcoal carbon body, muted burgundy sidepods, silver accent, fictional NORD sponsor, number 17; three overhead white industrial spotlights, floor reflections, front three-quarter view, negative space left, no UI. |
| `keller.webp` | Адриан Келлер | Fictional Austrian racing driver, 27, short dark brown hair, blue grey eyes, stubble, calm serious direct gaze, black VANTA racing suit with muted burgundy shoulders, head and shoulders against a graphite studio background, soft side light and red rim. |
| `weber.webp` | Лукас Вебер | Fictional German racing driver, 24, short sandy blond hair, clean shaven, green eyes, reserved focused expression, matching black and burgundy VANTA suit, centered head-and-shoulders studio portrait. |
| `morozova.webp` | Елена Морозова | Fictional woman technical director around 40, short brown bob, understated glasses, focused expression, graphite VANTA technical shirt, centered head-and-shoulders portrait, dark background and restrained side light. |
| `ricci.webp` | Марко Риччи | Fictional Italian race strategist around 35, olive skin, short curly dark hair and neat beard, thoughtful expression, graphite VANTA polo, centered head-and-shoulders portrait in a dark studio. |

Иллюстрация машины используется как изображение, а не как интерактивная модель. Гараж строит собственную геометрию программно. Замена материалов и логотипов изменяет именно эту модель.

## Шрифты и библиотеки

- Manrope Variable: локальные латинский и кириллический WOFF2; лицензия `dist/assets/FONT-LICENSE.txt`.
- Lucide: локальная UMD-сборка; лицензия `dist/vendor/LUCIDE-LICENSE.txt`.
- Three.js 0.180.0, OrbitControls, RoomEnvironment: локальные ES-модули; лицензия `dist/vendor/THREE-LICENSE.txt`.
- `three-software.js`: программный рендерер, подготовленный для макета. Использует геометрию и камеру Three.js, Canvas2D для вывода.
- Трасса и аналитические диаграммы — точные программные визуализации демонстрационных данных.

Реальные марки автомобилей, логотипы реальных спонсоров и фотографии реальных пилотов не используются.
