Her er ein nedkort og oppdatert versjon av README.md for ArchiFigure, skriven på nynorsk. Du kan oppdatere GitHub-repoet med denne filen.

---

# ArchiFigure

**ArchiFigure** er eit nettbasert verktøy som automatisk genererer 3D-modellar av menneskefigurar frå eit enkelt bilete – anten ved å laste opp eit foto eller ved å skrive inn ein tekstskildring. Verktøyet er utvikla for arkitektar, designstudio og studentar som ynskjer å få inn liv og skala i sine arkitekturprosjekt.

## Funksjonar
- **Automatisk 3D-modellgenerering:** Generer 3D-modellar med høg detaljgrad ved hjelp av kunstig intelligens.
- **Enkel input:** Bruk tekstprompt eller last opp eit eige bilete.
- **Avanserte innstillingar:** Juster parametrar som oppløysing, genereringssteg og fjerning av bakgrunn.
- **Prosjektstyring:** Organiser modellane dine i prosjekt, og last ned dei i GLB-format.
- **Interaktiv visning:** Inspiser 3D-modellane direkte i nettlesaren med integrert 3D-visar.

## Korleis det fungerer
```mermaid
flowchart LR
    Brukar -->|Tekstprompt eller bilete| Biletgenerator
    Biletgenerator -->|Generert bilete| Hunyuan3D-2
    Hunyuan3D-2 -->|3D-modell (GLB)| Prosjektbibliotek
    Prosjektbibliotek -->|Visning/Nedlasting| Brukar
```

## Installasjon
```sh
# Klon repoet
git clone https://github.com/YOUR-USERNAME/archifigure.git
cd archifigure

# Installer avhengigheter
npm install

# Køyr utviklingsserveren
npm run dev
```

## Bruk
1. **Opprett prosjekt:** Lag eit nytt prosjekt for å organisere dine 3D-modellar.
2. **Last opp bilete eller skriv prompt:** Bruk det intuitive grensesnittet til å laste opp eit bilete eller skriv ein tekstskildring (t.d. "ung mann i dress som smiler").
3. **Generer 3D-modell:** Juster eventuelt innstillingar (fjerning av bakgrunn, oppløysing m.m.) og trykk på *"Lag 3D-modell"*.  
4. **Vis og last ned:** Sjekk den interaktive 3D-visaren, og last ned modellen som GLB-fil.

## Visuelle oversikter
[![teneste-oversikt](https://i.ibb.co/6LYYxDj/teneste-oversikt.jpg)](https://ibb.co/ntrrvQx)  
[![system-flyt](https://i.ibb.co/wrCDbCYY/system-flyt.jpg)](https://ibb.co/3YWt8Wkk)  
[![3d-figur-rutenett](https://i.ibb.co/sBN5pbx/3d-figur-rutenett.jpg)](https://ibb.co/TC7KDYj)

## Kostnadsoverslag
- **Eitt biletegenerering:** ca. $0.05 (én bilete)
- **3D-modellgenerering (Hunyuan3D-2):** ca. $0.15 per modell
- **Totalt per modell:** ca. $0.20  
- **For ein batch på 6 modellar:** ca. $1.20

*(Prisane er anslag basert på skytjenester for GPU-køyring)*

## Lenkjar
- [ArchiFigure på GitHub](https://github.com/YOUR-USERNAME/archifigure)
- [Demo-nettstad](https://archifigure.iverfinne.no) *(Passord: jeyvilha3d)*

---

Denne README.md-en gjev eit raskt overblikk over funksjonaliteten, korleis du installerer og brukar verktøyet, og inkluderer visuelle diagram for systemflyt. I tillegg til denne nedkorta versjonen, har vi utarbeidd eit meir detaljert whitepaper for teknisk dokumentasjon (sjå whitepaper.md).

Du kan no oppdatere GitHub med denne README.md-en og vidareutvikle dokumentasjonen etter behov.