# BI13 — лендинг «Мобильная съёмка»

Единый лендинг Aesthetic + High Level для встраивания на Тильду через iframe + GitHub Pages.

## Страница

- GitHub Pages: https://elenasamanchuk.github.io/bi13-highlevel/
- Live (Тильда): https://bi13pro.ru/aesthetic-high-level

## Вставка на Тильду

1. Откройте страницу в редакторе Тильды.
2. Добавьте блок **HTML-код** (T123).
3. Вставьте содержимое файла [`tilda-embed.html`](./tilda-embed.html).
4. Опубликуйте страницу Тильды.

Высота iframe подстраивается автоматически через `postMessage`.

Появление блоков в эмбеде идёт по `VIEWPORT_TYPE` от Тильды (как в bi13-taplink): iframe сам не скроллится, IntersectionObserver там «видит» всю страницу сразу. Якоря шлют `SCROLL_TYPE` родителю.

На ширине **ниже 480px** страница ведёт себя как Zero Block Тильды: артборд 320px + `zoom = ширина / 320`.

Шапка сайта и юридический футер живут на Тильде — в этом блоке их нет.

Важно: после каждого обновления `tilda-embed.html` заново вставьте код в блок T123 и опубликуйте страницу.

## Обновление контента

Замените `index.html` / картинки и запушьте в `main` — GitHub Pages обновится сам. Если правили эмбед — добавьте `?v=` в `src` iframe.

## Источники

- Макет: [Сайт High Level](https://www.figma.com/design/TXHubvaWRdJuVqZsC0lKWl/) · фрейм «лендинг единый»
- CTA и даты — с [bi13pro.ru/aesthetic-high-level](https://bi13pro.ru/aesthetic-high-level): бот `tg://resolve?domain=BI13PROBOT`, старт продаж 17 августа, High Level — 12 октября
