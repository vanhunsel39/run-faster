# Run Faster – persoonlijke hardloopcoach

Een webapp (PWA) die trainingsschema's op maat maakt en bijstuurt, vergelijkbaar met Runna. Afgestemd op trainen op Saba: hitte, steile hellingen en weinig vlak terrein.

## Openen
- **Op je laptop:** dubbelklik `index.html` (Chrome of Edge). Alles werkt, alleen offline gebruik en installeren niet.
- **Op je telefoon (installeren):** zet de map online via een gratis host, bijvoorbeeld:
  - **Netlify Drop**: sleep de map `Run faster` naar https://app.netlify.com/drop.
  - **GitHub Pages**: maak een repository, upload de bestanden en zet Pages aan.

  Open de link op je telefoon en kies *Zet op beginscherm* (iPhone: deelknop; Android: menu → *App installeren*).
- Je gegevens staan **alleen op het apparaat** (localStorage). Wil je dezelfde gegevens op laptop en telefoon? Gebruik dan Doelen → *Back-up downloaden* / *Back-up terugzetten*.

## Garmin
- **Importeren:** in Garmin Connect bij een activiteit → *Exporteer origineel* (.zip/.fit) of GPX/TCX. Kies het bestand in de app, of sleep het in het venster op je laptop.
- **Naar je horloge:** met de knop *Naar Garmin* download je een .FIT-workout. Kopieer die via USB naar `GARMIN\NewFiles`.

## Trainingslogica
- **VDOT (Daniels):** je fitheid en trainingstempo's.
- **80/20 (Seiler/Fitzgerald):** ongeveer 80 % rustig, 20 % stevig.
- **Periodisering (Lydiard/Pfitzinger):** basis, opbouw, specifiek en taper.
- **Begrensde lange duurloop (Hansons).**
- **Coachstijlen:** Noorse singles en Galloway run-walk.
- **Correcties:**
  - hitte via temperatuur + dauwpunt
  - hoogte
  - hellingen via Minetti/GAP
  - belasting via ACWR

## Coach-functies
- **Evaluatie na elke training**: vergelijkt duur, tempo of hartslag per herhaling en RPE met het plan. Je krijgt "op koers", "aandachtspunt" of "bijsturen", met advies.
- **Op koers?**: verwachte eindtijd en trouw aan het schema. Zie Vandaag en na elke log.
- **Doelanalyse**: haalbare tijd in je weken, hoeveel weken je doel vraagt en wat helpt (loopdagen, kracht, volume). Wedstrijdhitte, hoogte en hoogtemeters tellen mee.
- **Hoogte**: in te stellen per training (tik een training aan), per wedstrijd (Doelen) en per log. Een FIT-bestand vult de gemiddelde hoogte automatisch in.
- **Wedstrijdplan**: A/B/C-doelen, splits, tempo per helling, voeding (g koolhydraten per uur, gel-schema, drinken, zout), stapelen, ontbijt en warming-up.
- **Andere sporten**: stel onder Doelen → stap 5 je vaste routine in (CrossFit, zwemmen, pickleball, hiken, fietsen). Zware runs komen niet op of direct na een zware sportdag. CrossFit vervangt de krachttraining. Het rustige loopvolume gaat iets omlaag bij veel andere training. Losse sessies log of importeer je als activiteit; Garmin-bestanden worden automatisch herkend (zwemmen, fietsen, hiken). Alles telt mee in je belasting (ACWR).

## Tests
Open `tests/tests.html` in de browser. De pagina toont of alle zelftests slagen (rekenkern, schema's, import/export).

## Bij publiceren (hosting)
Stel bij voorkeur deze HTTP-headers in (OWASP):
- `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Strict-Transport-Security`

`og:url` en `canonical` in `index.html` wijzen nu naar `https://vanhunsel39.github.io/run-faster/`. Vervang dat door je echte adres.
