# AGENTS.md — Inventar Application Architecture & Agent Guide

> **Svrha:** Ovaj dokument služi kao trajna memorija i arhitektonska referenca za sve AI asistente (Antigravity/Gemini) koji rade na projektu **Inventar**.

---

## 1. Pregled Projekta
**Inventar** je moderna, PWA-spremna web aplikacija za praćenje, iznajmljivanje, zaduživanje i servisiranje tehničke opreme za događaje (audio, video, rasveta, bina, kablovi i prateća oprema).

---

## 2. Tehnološki Stack
* **Frontend:** [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite 8](https://vite.dev/) (sa Rolldown bundlerom i `vite-plugin-mkcert` za lokalni HTTPS).
* **Styling & UI:** [Tailwind CSS v4](https://tailwindcss.com/), Radix UI primitives, Lucide React ikonice, Sonner (toast notifikacije).
* **State & Data Fetching:** [Zustand](https://zustand-demo.pmnd.rs/) (lokalno stanje i korpa za skeniranje), [TanStack React Query v5](https://tanstack.com/query/latest) (serverski keš i sinhronizacija).
* **Baza i Autentifikacija:** [Supabase](https://supabase.com/) (`@supabase/supabase-js`, PostgreSQL, RLS permisije, storage).
* **PWA & Offline:** `vite-plugin-pwa`, `dexie` (IndexedDB offline red čekanja i sinhronizacija), `localforage`.
* **Barkod & QR Scanner:** `@zxing/browser`, `@zxing/library`, Web Audio API + Haptic Vibration API za zvučnu potvrdu skeniranja.
* **PDF & Dokumenti:** `pdf-lib` (automatsko generisanje reversa sa digitalnim potpisom, lazy-loaded).
* **Mape & Grafikoni:** `leaflet`, `react-leaflet`, `recharts`.

---

## 3. Struktura Direktorijuma
```
inventar/
├── src/
│   ├── app/                 # Aplikativne konfiguracije
│   ├── assets/              # Statički resursi (slike, logoi)
│   ├── components/
│   │   ├── assets/          # Prikaz slika opreme, prijave oštećenja, uvoz CSV-a
│   │   ├── checkout/        # Čarobnjaci za zaduživanje/razduživanje, digitalni potpis
│   │   ├── common/          # StatusBadge, CommandPalette, ErrorBoundary, PageLoader, LocationInput
│   │   ├── layout/          # AppShell, PageHeader, navigacija
│   │   ├── scanner/         # CameraScanner sa autofokusom, baterijom (torch) i zoom-om
│   │   └── ui/              # Radix UI bazne komponente (Button, Dialog, Card, Input...)
│   ├── features/
│   │   ├── auth/            # AuthProvider, useAuth (Supabase session)
│   │   ├── cart/            # useScanCart (korpa za brzo zaduživanje skeniranih stavki)
│   │   ├── offline/         # Dexie DB (db.ts) i sync red (queue.ts)
│   │   ├── rbac/            # permissions.ts (kontrola pristupa na osnovu uloga)
│   │   └── theme/           # useTheme (tamna / svetla tema)
│   ├── integrations/
│   │   └── supabase/        # Supabase klijent i generisani Database tipovi
│   ├── lib/
│   │   ├── sound.ts         # Zvučni (Web Audio) i haptički fidbek za skener
│   │   ├── status.ts        # Mapiranja i konstante statusa opreme
│   │   ├── revers-pdf.ts    # Kreiranje PDF reversa sa potpisom i stavkama
│   │   ├── qr-print.ts      # Priprema i štampa QR nalepnica za opremu
│   │   ├── calculations.ts  # Matematički proračuni amortizacije i vrednosti
│   │   └── csv.ts           # CSV uvoz i izvoz
│   ├── pages/               # Sve stranice (Lazy loaded u App.tsx)
│   ├── App.tsx              # Rute sa Code-Splittingom (React.lazy + Suspense)
│   └── main.tsx             # React DOM root render
├── supabase_schema.sql      # Glavna SQL šema sa tabelama i funkcijama
├── supabase_role_permissions.sql # RLS i RBAC uloge
└── vite.config.ts           # Vite konfiguracija sa PWA, mkcert i manualChunks
```

---

## 4. Ključni Tokovi Podataka (Workflows)

### A. Životni Ciklus Opreme (Asset Lifecycle)
Statusi definisani u `src/lib/status.ts`:
- `available` (Dostupno u magacinu)
- `reserved` (Rezervisano za predstojeći događaj)
- `at_event` (Na terenu / događaju)
- `in_transit` (U transportu)
- `returned` (Vraćeno, čeka pregled)
- `damaged` (Prijavljeno oštećenje / polomljeno)
- `in_service` (Poslato na servis/popravku)
- `written_off` (Rashodovano)

### B. Zaduživanje i Razduživanje (Checkout / Revers)
- Putanja: `/checkouts`, `CheckoutWizard.tsx`, `ReturnWizard.tsx`, `CheckoutDialog.tsx`.
- Koraci:
  1. Izbor događaja (Event) ili klijenta (Client).
  2. Izbor opreme (pojedinačno ili skeniranjem barkoda/QR koda).
  3. Preuzimalac (odgovorno lice i kontakt).
  4. Digitalni potpis na ekranu (`SignaturePad.tsx`) sa podrškom za **Fullscreen / prošireni režim** za lakše potpisivanje prstom na telefonima.
  5. Kreiranje zaduženja u bazi + generisanje PDF reversa (`revers-pdf.ts`) ili POS termalnog revers slipa.
  6. **Pretraga i kamera skener:** Brza pretraga reversa unosom teksta ili klikom na ikonu kamere za direktno skeniranje QR koda sa papirnog/termalnog reversa.
  7. **Zatvorena petlja oštećenja:** Prilikom razduživanja opreme sa statusom „Oštećeno”, sistem automatski kreira nalog za servis (`service_records`) i prijavu oštećenja (`damage_reports`) sa unetim opisom i slikama sa kamere.

### C. Brzo Skeniranje Opreme (Scanner & Mobile Camera Engine)
- Putanja: `/scan`, `src/pages/Scanner.tsx`, `src/components/scanner/CameraScanner.tsx`, `src/components/scanner/QuickStatusModal.tsx`.
- Arhitektura skenera:
  - **Hibridni engine za dekodiranje:**
    - Primarni: Native `BarcodeDetector` API (Google Play Services ML Kit na Androidu, Apple Vision framework na iOS 17+) za 60fps GPU/NPU detekciju bez opterećenja procesora.
    - Fallback: `@zxing/browser` (`BrowserMultiFormatReader`) za univerzalnu podršku na svim desktop i starijim pregledačima.
  - **Maksimalno hardversko fokusiranje mobilne kamere:**
    - Kontinualni autofokus (`focusMode: "continuous"`), ekspozicija i balans bele.
    - **Tap-to-Focus**: Proračun relativnih koordinata dodira na video vizir, slanje `pointsOfInterest: [{ x, y }]` i ISP pulsno refokusiranje (`single-shot` -> `continuous`).
    - Animacija HUD fokusnog prstena (zeleni pulsajući nišan na mestu dodira).
    - **Makro fokus asistencija:** Automatski fokus na maloj udaljenosti (3–10 cm) uz optičko/digitalno uvećanje za sitne nalepnice i kablove.
    - **Pinch-to-zoom i brza dugmad za zum:** Dvoprsti gest na ekranu + prečice `1x`, `1.5x`, `2x`, `3x`.
    - **Blic / Lampa (Torch):** Uočljivo dugme sa svetlosnim indikatorom za mračne magacine i bekstejdž.
    - **Pametni izbor i rotacija sočiva (Camera Switcher):** Prioritizuje primarno zadnje sočivo umesto ultra-širokog sočiva sa fiksnim fokusom, uz 1-klik dugme za promenu kamere.
    - **Štednja baterije (Power Saving Pause):** Automatsko pauziranje dekodiranja i video analize kada je otvoren bilo koji modal ili sheet dijalog.
  - **Tri operativna režima rada u magacinu:**
    1. *„Izdavanje (U korpu)” (Outbound Batch):* Magacioner serijski skenira artikle dok ih pakuje — svaki kod proverava bazu i dodaje u korpu za zaduženje uz zvučni bip i haptičku vibraciju, sa plutajućom trakom za masovno zaduženje jednim potpisom (`BulkCheckoutDialog`).
    2. *„Prijem (Razduživanje)” (Inbound Check-in):* Skeniranje vraćene opreme automatski pronalazi aktivno zaduženje, prikazuje događaj, preuzimaoca i rok povrata, i nudi 1-tap instant razduživanje („Ispravno”) ili prijavu kvara („Oštećeno”) sa slanjem na servis. Opcioni prekidač za *1-sken auto prijem* omogućava instant razduživanje celog kombija za par sekundi.
    3. *„Info / Karton” (Inspect Mode):* Prikaz kartona artikla (slika, lokacija, kategorija, status) sa promenom statusa na licu mesta (`QuickStatusModal`).
  - **Prepoznavanje Revers QR Kodova:** Očitavanje koda koji počinje sa `REV-` automatski otvara dijalog reversa sa spiskom svih zaduženih stavki i opcijom za grupno razduživanje celog reversa odjednom.
  - **Hardverski USB / Bluetooth barkod laser listener (HID Keyboard Wedge):** Pozadinski listener koji hvata brze sekvence laserskih čitača (<50ms) i automatski obrađuje barkod bez potrebe za fokusom na tekstualno polje.
  - **Istorija sesije:** Hronološki spisak svih očitanih stavki tokom rada sa mogućnošću CSV izvoza.

### D. Offline Rad (PWA & Queue)
- Kada nema interneta, operacije se beleže u lokalni `IndexedDB` preko `src/features/offline/queue.ts`.
- Čim se uređaj ponovo poveže na mrežu (`navigator.onLine`), red se automatski prazni i sinhronizuje sa Supabase bazom.

### E. Popisi i Sravnjivanje Stanja (Stock Audits)
- Putanja: `/inventories` i `/inventories/:inventoryId`.
- Komponente: `src/pages/Inventories.tsx`, `src/pages/InventoryDetails.tsx`, `src/components/inventory/InventoryPrintReport.tsx`.
- Podržava:
  - Dashboard sa KPI metrikama (aktivni, završeni, tačnost sravnjenosti, ukupan broj komada).
  - Filtriranje po statusima (u toku, završeni, otkazani) i lokacijama/magacinima.
  - Pokretanje popisa sa preporučenim nazivom, izborom lokacije i kategorije opreme.
  - Dvostruki režim skeniranja: kamera skener + bežični/USB barkod laser sa Web Audio zvučnim i haptičkim odzivom.
  - Tabela sa statusnim tabovima (sve, manjak, pronađeno, višak) i brzim stepperom količina (`+` / `-`).
  - Dodavanje nepopisanih (ad-hoc pronađenih) artikala direktno u popis.
  - Automatsko sravnjivanje trenutnih lokacija pronađene opreme pri zaključivanju.
  - Zvanični formatirani Zapisnik o popisu opreme za štampu/PDF sa popisnom komisijom i potpisima, plus CSV izvoz.

### F. Kalendar i Planiranje (Calendar & Scheduling)
- Putanja: `/calendar`.
- Komponente: `src/pages/Calendar.tsx`, `src/components/calendar/CalendarEventDialog.tsx`, `src/components/calendar/QuickEventModal.tsx`.
- Podržava:
  - Tri režima prikaza:
    1. **Mesečni kalendar (Month Grid):** Pregled svih dana u mesecu sa brojem artikala, statusnim bojama i klikom na dan za kreiranje.
    2. **Gantt opterećenja opreme (Equipment Timeline):** Horizontalni Gantt raspored angažovanja opreme po artiklima (7, 14 ili 30 dana).
    3. **Agenda:** Hronološki spisak predstojećih događaja sa klijentima, lokacijama i satnicom.
  - KPI Dashboard: Događaji danas, događaji ovog meseca, ukupno angažovano opreme na terenu, upozorenja o kašnjenju povrata (overdue checkouts).
  - Brzi pregled detalja događaja i angažovane tehnike (`CalendarEventDialog`).
  - Brzo kreiranje događaja sa selektovanim datumom (`QuickEventModal`).

### G. Prilagođavanje Firme & Brending (Company Customization / White-label)
- Putanja: `/settings/company`.
- Komponente i servisi: `src/pages/SettingsCompany.tsx`, `src/features/company/use-company-settings.ts`.
- Dozvole: **Isključivo administrator** (`hasRole("admin")` i `hasPermission("admin")`).
- Podržava:
  - **Profil i pravni podaci:** Puni naziv preduzeća, skraćeni brend naziv za mobilne ekrane, PIB, MB, žiro račun i banka, adresa sedišta, kontakt telefon, zvanični email, web sajt.
  - **Logotip i vizuelni brending:** Upload slike logotipa (PNG, SVG, JPG) sa brisanjem i pregledom; izbor primarne akcentne boje sistema (Sky Blue, Emerald, Indigo, Violet, Amber, Crimson, Cyan ili proizvoljni HEX kod).
  - **PDF Revers i zaduživanja:** Zvanični naslov dokumenta, pravna klauzula / izjava o materijalnoj odgovornosti preuzimaoca opreme (štampa se iznad potpisa), prefiks broja reversa, podrazumevani rok povrata, opcija prikaza nabavne vrednosti opreme.
  - **Šifarnik i inventar:** Prefiks automatskih šifara opreme (`EQ-`, `AST-`), valuta sistema (`RSD`, `EUR`, `USD`, `CHF`, `BAM`), godišnja stopa amortizacije (%) i tekst na QR nalepnicama.
  - **Globalna integracija:**
    - `AppShell.tsx`: Prikaz logotipa i brend naziva u zaglavlju i bočnoj traci.
    - `revers-pdf.ts`: Automatski memorandum sa podacima firme, pravnom klauzulom i logotipom.
    - `PrintQrDialog.tsx`: Preuzimanje brend imena za štampu QR nalepnica.
    - `InventoryPrintReport.tsx`: Zvanično zaglavlje firme na Zapisniku o popisu.
  - **Baza podataka:** Tabela `company_settings` sa RLS politikom (`SELECT` dozvoljen ulogovanima, `INSERT`/`UPDATE` samo administratorima).

### H. Podrška za Termalne Štampače (Thermal Printing Engine)
- Putanja: `src/lib/thermal/`, `src/components/checkout/ThermalReversDialog.tsx`, `src/components/assets/PrintQrDialog.tsx`.
- Arhitektura:
  - **POS Termalni Reversi (Receipts):**
    - ESC/POS generator za 58mm (32 kolone) i 80mm (48 kolona) stone i prenosne POS štampače.
    - Memorandum firme, revers identifikator sa QR kodom za brzi povrat jednim skeniranjem, lista zadužene opreme, pravna klauzula, digitalni potpis i auto-cut.
    - `ThermalReversDialog.tsx`: Realističan grafički prikaz POS papirne trake sa zupčastim rubom i instant tasterima za štampu.
  - **Termalne Nalepnice za Opremu (Labels):**
    - TSPL generator (TSC, Xprinter, Zebra-kompatibilni štampači).
    - Standardne dimenzije nalepnica: 50x30mm, 58x40mm, 60x40mm, 40x25mm, 80x50mm, kao i A4 tabaci (24/str i 40/str).
    - QR kod, 1D Code128 barkod ili kombinovano.
    - `PrintQrDialog.tsx`: Dinamički uživo preview nalepnice sa realističnom promenom proporcija (aspect-ratio), grafičkim kotiranjem (ruler u mm po širini i visini), simulacijom medija (termalna rolna sa perforacijama vs A4 tabak) i automatskim skaliranjem tipografije i QR koda prema izabranoj dimenziji.
  - **Univerzalna Kompatibilnost & Hardverska Povezanost:**
    - Zero-install: Optimizovan CSS `@page` zero-margin monohromatski renderer za 100% uređaja (uključujući iOS Safari i mobilne telefone).
    - Direktno USB povezivanje preko Web Serial API (`navigator.serial`).
    - Mobilni Bluetooth POS štampači preko Web Bluetooth API (`navigator.bluetooth`).
    - Kalibracija i probna štampa testnog slipa u administratorskim podešavanjima (`/settings/company`).

### I. Baza Klijenata (Clients Directory)
- Putanja: `/clients`, `src/pages/Clients.tsx`.
- Podržava:
  - Brzu pretragu po nazivu klijenta, emailu, adresi, PIB/MB broju i imenima/telefonima kontakt osoba.
  - 1-tap mobilne pozive (`tel:`) sa namenskim `PhoneCall` tasterom i haptičkim odzivom.
  - Direktno slanje emaila (`mailto:`) i otvaranje lokacije na Google Mapama.
  - B2B identifikatore: PIB i Matični broj (MB) pravnog lica sa validiranim značkama.
  - Prikaz broja realizovanih događaja i indikator aktivnih angažovanja na terenu.

### J. Lokacije Opreme (Locations Architecture)
- Putanja: `/locations`, `src/pages/Locations.tsx`.
- Podržava:
  - Proračun i agregaciju broja komada opreme po svakoj lokaciji (`current_location_id`).
  - 1-klik direktan skok na katalog sa predfiltriranom lokacijom (`/assets?location={id}`).
  - Pretragu lokacija i filtere po tipu (`warehouse`, `vehicle`, `shelf`, `sector`, `field`, `backstage`, `event_zone`).
  - Zaštitu od nehotičnog brisanja magacina/vozila ukoliko se na njemu nalazi oprema.
  - Vizuelno ugnježđavanje podlokacija (roditelj → dete).

### K. Katalog Opreme & Masovne Operacije (Assets Catalog)
- Putanja: `/assets`, `src/pages/Inventory.tsx`.
- Podržava:
  - **Filter po Lokaciji:** Usklađen sa URL `?location={id}` query parametrima.
  - **Kamera skener u pretrazi:** Brza pretraga skeniranjem barkoda/QR koda direktno sa kamere uređaja (`CameraScanner`).
  - **Masovne operacije:** Premeštanje selektovane opreme na novu lokaciju (`BulkMoveDialog`), promena statusa, štampa QR nalepnica i masovno dodavanje u korpu za izdavanje (`useScanCart`).
  - **Horizontalni brzi status čipovi:** Touch-friendly traka sa brojačima artikala po svakom statusu u realnom vremenu.
  - **KPI i rezime traka:** Prikaz broja filtriranih artikala od ukupnog broja i sumirane knjigovodstvene vrednosti.
  - **Ergonomija i čiste kartice:** Uklonjen šum ponavljajućih placeholder opisa, dodat bedž kategorije, 36x36px touch checkbox sa zaštićenom navigacijom.
  - **Meni brzih akcija (3-dots menu):** Na svakoj Grid kartici i u Tabeli: dodavanje u korpu za izdavanje, štampa QR nalepnice pojedinačnog artikla i kopiranje šifre u clipboard.
  - **Alati i Izvoz padajući meni:** Čisto zaglavlje bez zagušenja na mobilnim uređajima, sa grupisanim akcijama štampe svih QR nalepnica, uvoza i izvoza CSV/XML.


### L. Izveštaji i Analitika (Reports & BI)
- Putanja: `/reports`, `src/pages/Reports.tsx`.
- Podržava:
  - Finansijski pregled: nabavna vrednost, trenutna vrednost i amortizacija.
  - Dinamički raspon za kretanje zaduženja: 7 dana, 30 dana, 90 dana i 1 godina.
  - Analitički vidžet iskorišćenosti opreme po kategorijama (% angažovane tehnike na terenu naspram dostupne u magacinu).
  - Top 10 najkorišćenije opreme i kompletan finansijski CSV izvoz.

### M. Integracija sa Poslovnim Softverom InfoSys (ERP Integration)
- Putanja: `/settings/infosys`, `src/pages/SettingsInfosys.tsx`.
- Biblioteka i klijent: `src/lib/integrations/infosys/` (`client.ts`, `types.ts`, `imp-txt-converter.ts`), `src/features/integrations/use-infosys-settings.ts`.
- Arhitektura povezivanja:
  - **InfoSys API Server (.NET 4.0 IIS / Abyss):** REST JSON komunikacija sa Visual FoxPro DBF bazom preduzeća preko fiksnog porta ili lokalne mreže uz API Bearer autorizaciju.
  - **Režim simulacije (Demo / Offline Mock):** Ugrađeni realistični dataset srpskih privrednih subjekata i audio/video/rasveta opreme za razvoj i testiranje bez aktivnog Windows servera.
  - **Modul `OS` (Osnovna sredstva):**
    - Sinhronizacija inventarskih brojeva, nabavne vrednosti, sadašnje knjigovodstvene vrednosti i stope amortizacije (`stopaAmortizacije`) direktno u katalog opreme (`assets`).
  - **Modul `FIN_KD` (Kupci i dobavljači):**
    - Dvosmerno preuzimanje šifarnika partnera, PIB-a, Matičnog broja, adrese sedišta i kontakata u tabelu klijenata (`clients`).
  - **Modul `ROB` / `X-STOCK_B` (Robno i magacinsko poslovanje):**
    - Slanje reversa i zadužene opreme direktno u InfoSys kao magacinski dokument zaduženja.
  - **Modul `IMP_TXT` (Offline razmena bez interneta):**
    - Formatirani generator CSV fajlova sa standardnim separatorom tačka-zarez (`;`) za direktan import kroz desktop aplikaciju InfoSys FoxWin (`INFOSYS_OS_*.csv`, `INFOSYS_PARTNERI_*.csv`).
  - **Dijagnostika & Dnevnik rada:**
    - Merenje mrežnog odziva (ping latency u milisekundama), detekcija verzije servera i baze podataka, kao i revizorski trag (audit log) prethodnih razmena.

---

## 5. Razvoj i Verifikacija
* **Dev Server:** `npm run dev` (pokreće se na `https://localhost:5173/` uz mkcert HTTPS).
* **Build:** `npm run build` (vrši `tsc -b` tipsku proveru i Vite/Rolldown optimizovano pakovanje u podeljene chunk-ove).
* **Linter:** `npm run lint` (`oxlint` za instant analizu koda).

