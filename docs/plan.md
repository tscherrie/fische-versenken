# Salmon Survival Extreme – Plan

*Abgesegnet am 26.09.2026 (bis dahin Arbeitstitel „Fische versenken“). Die Entscheidungen stehen in Teil 8.*

## 1. Kurzfassung

Das Spiel ist Salmon Survival Next mit Waffen und Koop. Grafik, Fluss, Lebensstufen, Kraft-Balken und Ziel bleiben unverändert: zum Meer und zurück, laichen, wo man geschlüpft ist. Neu ist: Alles, was kein Lachs ist, greift an, und man schießt zurück. Waffen sind die einzigen Sammelobjekte. Mit jeder Stufe werden sie größer, vom Piu-Piu-Laser bis zu Katana und Bauchtorpedos; ab einer bestimmten Stufe trägt man zwei, die linke Maustaste feuert die eine, die rechte die andere.

Bis zu vier Freunde schlüpfen gemeinsam an der Quelle und teilen sich eine Brut: Jeder Tod kostet einen Fisch vom Zähler, und das Team muss es ins Meer und zurück schaffen, bevor alle tot sind. Jeder wächst für sich, alle dürfen frei schwimmen, und mit jedem Spieler im Raum kommen mehr Gegner.

Technisch ist es ein Fork von Next; Repo und Vercel-Projekt stehen schon. Der neue Code liegt in eigenen Dateien, damit Grafik-Updates aus Next weiter per `git merge` hereinkommen. Im Koop rechnet jeder Rechner die Welt um seinen eigenen Fisch, und ein kleiner Cloudflare-Dienst verbindet die Spieler. Die Seite selbst bleibt auf Vercel.

## 2. Spielablauf

**Bleibt, wie es ist:** alle Stufen von der Dottersackbrut bis zum Laichlachs, Wachstum durch Fressen, Smolt-Wanderung, Meer, Heimatduft, Sprünge, Stürme, Nordlicht, Laichbett, neue Generation, Logbuch, Abzeichen.

**Steuerung:**
- Leertaste: Sprint, Biss und Sprung wie bisher. Im Grundspiel löst auch die linke Maustaste den Ausfall-Stoß aus; hier gehört sie der Waffe.
- Linke Maustaste halten: Waffe 1 feuert. Geschossen wird zu dem Punkt unter dem Fadenkreuz, mit Zielhilfe.
- Rechte Maustaste: Sie feuert die Bauchwaffe, sobald man zwei trägt (ab dem Smolt, Teil 3). Vorher bleibt sie frei.
- Handy: Auto-Feuer ist Standard, weil beide Daumen schon belegt sind (lenken und schwimmen).
- Ansagen: „Treffer!“ und „Versenkt!“; „Wasser!“ nur bei schweren Einzelschüssen.

**Tod allein:** Ein Geschwister in der Nähe übernimmt, auf derselben Stufe. Der Stufenbalken fällt auf 90 % statt wie im Grundspiel auf 70 %, weil man hier viel öfter stirbt. Die eigene Waffe bleibt 60 s als „Rache-Kapsel“ am Todesort liegen, und nach jedem Boss gibt es einen Checkpoint. Ist die Brut aufgebraucht, schlüpft eine neue an der Quelle. Den Tod im Koop behandelt Teil 5.

**Neue Regeln.** Alle liegen in der Kampfschicht, die Grafik ändert sich nicht:
- **Kampf nährt das Leben:** Erlegte kleine Fische kippen auf den Rücken und lassen sich fressen. Jeder Kill bringt 1–3 % Stufenfortschritt. Im Kampf kostet Schwimmen nur die halbe Kraft, und nach einem Treffer ist man kurz unverwundbar.
  *Warum:* Die Kraft ist im Grundspiel Leben, Ausdauer und Wachstumsbremse zugleich; unter 30 % Kraft wächst man nicht mehr. Ohne Ausgleich wächst am schnellsten, wer Kämpfen aus dem Weg geht. Fressen bleibt trotzdem der Hauptweg zu wachsen.
- **Verschlucken bleibt sofortiger Tod,** wie im Grundspiel: Jeder Jäger, der doppelt so lang ist wie der Fisch, verschluckt ihn mit einem Biss.
- **Laichwut:** Laichlachse fasten. Bei ihnen geben Kills Kraft zurück, sonst verbluten sie auf dem langen, umkämpften Heimweg.
- **Schwierigkeit** Tourist / Normal / Serious ersetzt den Vegan-Modus und gilt im Koop pro Spieler, damit auch ungeübte Mitspieler dieselben Wellen überstehen.

**Höhepunkte eines Lebens:**
1. *Kiesbett-Verteidigung:* Die Dottersackbrut liegt still im Kies (Stillhalten belohnt schon das Grundspiel) und feuert auf Libellen- und Käferlarven. Der erste „Versenkt!“ fällt nach unter 20 s. Die Dottersack-Phase dauert dafür etwa 2 statt 3,5 min. Im Grundspiel gäbe es in diesen Minuten nichts zu schießen, die ersten Jäger kommen erst weiter unten im Bach.
2. *Waffenlieferung:* Bei jedem Stufenwechsel sinkt eine Kapsel der neuen Stufe herab.
3. *Der alte König* in der Königsgumpe hütet das Katana.
4. *Mai-Flut:* Die Smolt-Wanderung wird ein Shoot-’em-up flussab. 16 Gefährten schießen mit, und mitten im Kampf geht es den Lachsfall hinunter.
5. *Wehrstau-Hecht*, *Treibjagd* der Gänsesäger, *Seehund* an der Mündung.
6. *Köderball unter dem Nordlicht.*
7. *Rückkehr der Riesen:* Horden im jetzt winzigen Fluss, danach der Bär am Lachsfall.
8. *Hüter des Laichbetts:* Verteidigung, danach die Balz, ruhig wie im Original.

Nach Bossen gibt es Atempausen; Sprünge und Balz bleiben kampffrei.

## 3. Waffen

Der Schaden wächst mit der Körperlänge, eine frühe Waffe bleibt also brauchbar. Alle Waffen sind echt und ernst gemeint, mit richtigem Splatter. Der Witz ist der Gegensatz zum schönen, ruhigen Fischleben und die Übertreibung: Mit jeder Stufe wird die Waffe auch im Verhältnis zum Fisch größer, vom Laser mit 0,4 Körperlängen bis zum Nodachi mit 1,3. * = erste spielbare Fassung (M1).

| Stufe | Waffe | Gefühl | Platz | Splatter / Klang |
|---|---|---|---|---|
| Dottersackbrut (ab Schlupf) | Kompaktlaser* | gehalten abwechselnd rote Pulse und ein Dauerstrahl; je größer der Fisch, desto weniger Pulse und desto länger der Strahl; Hitze statt Munition, bleibt ein Leben lang brauchbar | Rücken Mitte, auf der Schiene | tötet sauber: Der Fisch treibt mit verbranntem Loch auf; Dampfperlen, rote Wölkchen / scharfes „tsiu“, der Strahl summt |
| Brütling | Abgesägte Doppelflinte* | zwei Riesenknalle aus nächster Nähe, dann klappt sie auf und lädt nach | Rücken rechts | Kleinzeug zerplatzt in Brocken, der Rest fliegt weg, Hülsen sinken / tiefes „BUMM“, Klacken |
| Sömmerling | Revolver-Granatwerfer* | Granaten, die das Wasser schnell bremst: kurzer Bogen, prallen von Steinen in Verstecke | Rücken rechts | Kiesring, Fische fliegen in Stücken auseinander / hohles „tunk“, dumpfes „WUMM“ |
| Jährling (beim alten König) | Katana* | schnelle Hiebe vor der Schnauze, Sprint-Schnitt mit der Leertaste, Konter gegen zustoßende Räuber | Rücken links, Griff nach vorn | zwei Hälften mit roten Bändern / „shiing“, nasses „schlk“ |
| Parr | Flammenwerfer* | brüllender Feuerstrahl unter Wasser, genau wie in der Luft; Brennende stecken die Nachbarn an | Rücken Mitte: zwei Tanks wie Taucherflaschen, Strahlrohr rechts | verkohlte Fische, Rauch, Dampfblasen / „FWUUSCH“, Knistern |
| Smolt | Minigun | Motor heult auf, dann eine Wand aus Blei gegen Schwärme; bremst beim Feuern | Rücken rechts, Munitionskiste links, Gurt über den Rücken | roter Nebel, Schuppen, Messinghülsen regnen / „BRRRRT“ |
| Smolt | Bauchtorpedos | zielsuchend, großer Knall; 2 Rohre, ab dem Postsmolt 4 | Bauch | Stoßring, Blasensäule, betäubte Fische treiben rücklings / Sonar-Ping, „WUMMS“ |
| Postsmolt | Zwillings-Raketenwerfer | Salven mit Rauchspur, abwechselnd aus zwei Kapseln | Rücken links und rechts | Druckring, rote Wolke, Brocken fliegen / Zischen, „KRAWUMM“ |
| Postsmolt | Seeminen | hinter sich abwerfen: Wer folgt, schwimmt hinein; Kettenreaktion | Bauch: Gestell mit drei Hörnerminen | Blitz, Wassersäule / Kettenrasseln, Ping, „BUMM“ |
| Grilse | Panzerbüchse .50 | halten zum Ruhigstellen, loslassen: ein Schuss durch eine ganze Heringsreihe | Rücken Mitte, Lauf wie ein Narwalzahn | Blutstrahl aus jedem Fisch der Linie, Blasenkanal / „KA-DUMM“ |
| Grilse | Lichtbogenwerfer | Blitze springen von Fisch zu Fisch durch den Schwarm | Bauch: liegende Teslaspule, Elektroden unter dem Kinn | Fische zucken, platzen, treiben gekocht auf / Knistern, Knallen |
| Meerlachs | Partikelstrahler | cyanfarbener Strahl, den man durch den Schwarm zieht; je länger auf einem Ziel, desto heißer | Rücken Mitte | Hälften mit glühenden Rändern, kochende Blasen / tiefes Summen |
| Meerlachs | Granatharpune | spießt eine Heringsreihe auf oder fesselt den Seehund; dann explodiert der Kopf, und die Winde holt die Reste zum Maul | Bauch, Harpune unter dem Kinn | Fische am Schaft, rote Leine / „TUMM“, Seilsirren, Ratsche |
| Meerlachs, geheim | Schiffskanone | Lunte glimmen lassen: Eine Eisenkugel pflügt durch die Horde und rollt über den Kies weiter | Rücken rechts; liegt im Wrack, für Laichlachse in der Grotte hinter dem Lachsfall | Gasse aus rotem Nebel, Pulverdampf / Zischen, riesiges „BUMM“, Rumpeln |
| Laichlachs | Nodachi | ein Schwert fast so lang wie der Fisch kreist einmal um ihn herum; halten: Rotor | Rücken links, Scheide bis hinter die Schwanzflosse | Ring aus Hälften, roter Kringel / schweres „wuumm“ |
| Laichlachs | Kettensäge | hochdrehen und in die Horde rammen: ein Sägefisch mit Zweitakter | Bauch, Schwert unter dem Kinn | Dauerstrahl aus rotem Nebel und Brocken / Zweitakt-Kreischen |

**Regeln.**
- Große Waffen zerreißen, präzise töten (27.09.): Flinte, Granatwerfer, Minigun, Torpedos, Raketen, Minen, Panzerbüchse, Granatharpune, Schiffskanone und Kettensäge zerfetzen ihr Opfer in viele Stücke, egal wie groß es ist. Laser, Katana, Nodachi, Partikelstrahler und Lichtbogenwerfer töten nur, und das Opfer treibt bauchoben auf. Der Flammenwerfer verkohlt es, dann treibt es ebenfalls auf.
- Schussbahnen wie im Wasser: Kugeln, Schrot, Granaten und Kanonenkugeln verlieren schnell an Tempo, treffen nur auf kurze Distanz und sinken dann ab. Strahlen und Blitze fliegen gerade, Raketen und Torpedos haben einen Antrieb und ziehen Blasen.
- Energie- und Motorwaffen werden heiß.
- Feuerwaffen haben Magazine, die sich von selbst nachladen. Keine Waffe wird leer, und Munition gibt es nicht zu sammeln.
- Nahkampf hat nur Abklingzeiten.
- „Wasser!“ gibt es nur bei Panzerbüchse, Harpune und Kanone.

**Lieferung.**
- Der Laser ist ab dem Schlupf dabei.
- Bei jedem Stufenwechsel sinkt eine Kapsel mit der neuen Waffe der Stufe. Hat die Stufe zwei neue Waffen, kommt die zweite in den normalen Angeboten.
- Die Smolt-Kapsel bringt Minigun und Torpedos zusammen, damit die rechte Maustaste sofort etwas tut.
- Das Katana hütet der alte König. Die Jährlings-Kapsel würfelt deshalb aus dem bisherigen Vorrat.
- Bis zum Smolt gibt es nur Rückenwaffen.

**Gute Paare ab dem Smolt:**
- Minigun + Torpedos: Mai-Flut, Wehrstau-Hecht
- Raketen + Minen: Seehund an der Mündung
- Panzerbüchse + Lichtbogen: Heringsschwärme
- Partikelstrahler + Harpune: den Seehund fesseln, dann brennen
- Nodachi + Kettensäge: Heimweg, Bär
- Schiffskanone + Minen: Laichbett

**Aus der alten Tabelle entfallen:** Blubberkanone und Schilfrohr-Flinte (jetzt Doppelflinte), Sägeblatt-Werfer (seine Idee lebt in den Granaten weiter, die von Steinen abprallen), Tesla-Flosse (jetzt Lichtbogenwerfer), Wasserbomben (jetzt Seeminen), Nordlicht-Strahl (jetzt Partikelstrahler), Geysir-Werfer, Die Große Welle (an ihrem Platz in der Grotte liegt jetzt die Schiffskanone), Mini-Harpune (jetzt Granatharpune), Frost-Strahl.

**Das Geschirr.** Jede Waffe ist festgeschnallt, nichts schwebt.
- Zwei Gurte aus Gurtband laufen um den Körper: der Brustgurt direkt hinter den Brustflossen und unter ihnen hindurch, der Bauchgurt kurz vor der Rückenflosse.
- Darauf sitzt eine olivgrüne Sattelplatte mit einer Schiene für die Waffen in der Mitte und je zwei Stahlauslegern links und rechts.
- Ab dem Smolt hängt unter dem Bauch eine Stahlschiene für die Bauchwaffe.
- Die Dottersackbrut trägt nur einen orangefarbenen Spanngurt um Körper und Dottersack, mit einem Klemmblock für den Laser. Das Neugeborene ist an seine Waffe gezurrt wie Fracht, und der Gurt wird enger, während der Dotter schwindet. Der Brütling bekommt dann das richtige Geschirr.
- Alles sitzt vor der Rückenflosse, wo sich der Körper beim Schwimmen kaum biegt, und bleibt deshalb starr. Beim Laichlachs wächst es mit dem Buckel mit.
- Im Koop hat jeder Spieler seine Gurtfarbe: Schwarz, Coyote, Ranger-Grün, Wolfsgrau.

## 4. Gegner und Wellen

Lachse sind nie Ziel, auch die Rivalen nicht; die zwicken hier nicht mehr. Vögel, Säuger und der Angler werden „vertrieben“, beim Angler zerschießt man die Schnur. Die erste Fassung nutzt nur Körper, die es im Spiel schon gibt, dazu zwei vergrößerte Larven.

| Abschnitt | Gegner | Höhepunkt |
|---|---|---|
| Quelle | Larven, Groppe, Forellenparr, Eisvogel | Kiesbett |
| Bach | Forellenparr-Trios, Forelle, Gänsesäger, Reiher | König |
| Oberlauf | Elritzenschwärme, Äschen, Hecht, Otter | Lachsfall |
| Mittellauf | Barschrudel, Aal, Hecht, Angler | Wehrstau-Hecht |
| Unterlauf/Mündung | Stichlinge (Stachelsalven), Quallen, Dorsch | Treibjagd, Seehund |
| Meer | Hering- und Makrelenschwärme, Dorsch, Seehund, Basstölpel | Köderball |
| Rückweg | Horden aus Elritzen, Barschen, Hechten | Bär, Laichbett |

**Regisseur:**
- **Budget:** pro Minute und Stufe, von 20 bis 90. Kleinzeug kostet 1, Soldaten 3, schwere Gegner 8.
- **Rhythmus:** Aufbau, Spitze, Ruhe. Etwa 60 % der Zeit bleiben ruhig. Fällt die Kraft unter 35 %, beginnt eine Pause.
- **Richtung:** Gegner kommen immer aus der Schwimmrichtung. Flussab kommen die Schwärme flussauf entgegen. Auf dem Rückweg warten sie in Gumpen oder belagern die Tore. Höchstens 10 % flankieren, und die kündigen sich an.
- **Arenen:** An den Laichzug-Toren gilt der Arenamodus.
- **Leistung:** Sinkt die Framerate, kommen weniger Gegner. Das wirkt dann wie ruhigeres Tempo, nicht wie ein ruckelndes Spiel.

**Verbündete:** Beim Smolt-Zug und auf der Heimwanderung schießen die Schwarmfische mit. Zuerst nehmen sie Gegner ins Visier, die gerade zum Stoß ansetzen.

**Koop-Skalierung:** Gegner ×(1 + 0,7·(n−1)) bei n Spielern im Raum, höchstens 120 in einer Gegend. Das gilt auch, wenn jemand tot oder weit weg ist: allein ist man einfach schwächer. Boss-Lebenspunkte ×(1 + 0,75·(n−1)). Gegner greifen den nächsten Spieler an, nie gebündelt den Schwächsten.

## 4a. Die Waffen der Gegner (abgesegnet)

Jede Gegnerart trägt eine feste Waffe, festgeschnallt wie beim Lachs. Vögel und Säugetiere sterben und zerplatzen wie die Fische (der Angler bleibt unberührt, nur seine Schnur reißt). Nahkämpfer holen sichtbar aus; Fernkämpfer zielen kurz (der Moment zum Ausweichen) und schießen Kugeln, die das Wasser bremst.

| Gegner | Waffe | Art |
|---|---|---|
| Libellenlarve | Springmesser | Nahkampf |
| Gelbrandkäferlarve | Nagelpistole | Fernkampf, kurz |
| Groppe | Abgesägte Schrotflinte (schon im Spiel) | Fernkampf, kurz |
| Junge Forelle | Kampfmesser (schon im Spiel) | Nahkampf |
| Bachforelle | Maschinenpistole (schon im Spiel) | Fernkampf |
| Der alte König (Boss) | Minigun (schon im Spiel) | Fernkampf |
| Eisvogel | Stoßdolch am Schnabel | Nahkampf, Sturzflug |
| Gänsesäger | Revolver | Fernkampf |
| Graureiher | Harpunengewehr | Fernkampf, schwer und langsam |
| Elritzen (Schwarm) | Rasierklingen | Nahkampf |
| Äsche | Armbrust | Fernkampf, präzise |
| Flussbarsch (Rudel) | Pistole | Fernkampf |
| Hecht | Elefantenbüchse | Fernkampf, ein schwerer Schuss aus dem Hinterhalt |
| Otter | Machete | Nahkampf |
| Aal | Elektroschocker | Nahkampf, lähmt kurz |
| Stichlinge (Schwarm) | Wurfsterne | Fernkampf |
| Qualle | Seemine | treibt, explodiert bei Berührung |
| Dorsch | Pumpgun | Fernkampf, kurz |
| Seehund (Boss) | Raketenwerfer | Fernkampf |
| Heringe (Schwarm) | Wurfmesser | Fernkampf |
| Makrelen (Schwarm) | Sturmgewehr | Fernkampf |
| Basstölpel | Fliegerbomben | Sturzflug von oben |
| Bär am Lachsfall (Boss) | Kettensäge | Nahkampf |

## 5. Koop

### Spielregeln

- **Start:** Einer eröffnet einen Raum und schickt den Link (`?room=K7QX2M`). In der Lobby: Spitzname, Bereit-Knopf, Versionsprüfung. Sobald alle geladen haben, läuft ein Countdown, und alle schlüpfen nebeneinander im Kies der Quelle.
- **Frei schwimmen:** keine Leine. Wer sich trennt, hat weniger Feuerkraft, denn die Gegner richten sich nach der Zahl der Spieler im Raum, nicht nach der Gruppe vor Ort.
- **Jeder wächst für sich:** eigenes Fressen, eigene Stufe, eigene Waffenstufe. Auch die Jahreszeit gehört jedem selbst, weil sie im Grundspiel am Wachstum des eigenen Fisches hängt: Wer schneller wächst, sieht vielleicht schon Eis, wo der andere noch Sommer hat. Die Tageszeit ist für alle gleich.
- **Eine Brut fürs Team:** Der Geschwister-Zähler oben gilt für alle. Wer stirbt, kostet einen Fisch. Er übernimmt ein Geschwister ein Stück hinter dem Todesort, außerhalb des Gefechts, und muss von dort allein und angreifbar zum Team aufschließen. Die Stufe bleibt, der Stufenbalken fällt wie im Grundspiel.
- **Schwer:** Die Angriffe sind so hart, dass man leicht stirbt und der Zähler wirklich sinkt, und die Gegner werden mit jeder Stufe schwerer.
- **Die Brut schrumpft auch ungesehen:** Wie im Grundspiel sterben mit dem Wachstum Geschwister, die man nie sieht. Im Koop richtet sich das nach dem am weitesten gewachsenen Spieler, und die Untergrenzen für die späten Stufen (im Grundspiel 12 Smolts bis 4 Laichlachse) wachsen mit der Spielerzahl.
- **Zähler bei null:** Wer dann stirbt, schaut einem Mitspieler über die Schulter. Sind alle Fische tot, ist die Brut erloschen, und alle beginnen mit einer neuen Brut an der Quelle.
- **Ziel:** ins Meer und zurück zum Laichen. Wer das Laichbett erreicht, laicht wie im Grundspiel. Sind alle Überlebenden angekommen, beginnt für das ganze Team die nächste Generation an der Quelle, auch für die, die zuschauen mussten.
- **Pause:** Die Welt läuft für die anderen weiter. Der eigene Fisch steht fest im Wasser, treibt also nicht ab, ist aber nicht geschützt. Dasselbe gilt, wenn jemand das Fenster wechselt oder das Handy sperrt.
- **Stufenwechsel:** Funkeln und Fanfare bleiben, aber ohne die Zeitlupe des Grundspiels, weil die Welt der anderen weiterläuft.
- **Waffenkapseln:** Jeder bekommt seine eigene Kopie, und der Inhalt wird pro Spieler gewürfelt, damit im Team verschiedene Waffen unterwegs sind.
- **Bosse** gibt es einmal pro Raum: Wer da ist, kämpft, und versenkt ist versenkt, für alle. Die Waffe des Bosses bleibt für jeden liegen, auch für Nachzügler.
- **Ereignisse** wie Sturm, Angler, Otter, Eisschollen und Nordlicht erlebt jeder in seiner eigenen Welt, weil sie an seiner Jahreszeit hängen.
- **Kein Friendly Fire;** Lachse schwimmen durcheinander durch.
- **Abbrüche und Weiterspielen:** Wer die Verbindung verliert, kommt innerhalb von 30 Minuten auf seinen Platz zurück, dort, wo sein Fisch war. Der Raum merkt sich 30 Tage lang, wo jeder steht, sodass ihr an einem anderen Abend weiterspielen könnt. Der Solo-Spielstand bleibt unberührt.
- **Neue Mitspieler** steigen in der ersten Fassung erst mit der nächsten Generation ein.
- **Handys** dürfen mitspielen: mit Auto-Feuer und weniger Gegnern in ihrer Umgebung (Eco).

### Wie es technisch geht: Jeder rechnet seine Umgebung

- **Die eigene Welt:** Jeder Rechner simuliert seinen eigenen Fisch und die Welt um ihn herum wie im Grundspiel: Fluss, Futter, Pflanzen, Strömung. Übers Netz geht nur, was sich bewegt und zählt.
- **Was fest am Fluss liegt,** ist aus demselben Zufallswert gebaut und bei allen gleich: Fluss, Steine, Kapselplätze, Bossorte. Das geht nie übers Netz.
- **Mitspieler** senden ihren Fisch 20-mal pro Sekunde. Man sieht sie geglättet, mit Namensschild, auf der Karte (die Karte des Grundspiels ist dafür schon vorbereitet) und als Pfeil am Bildrand. Sind sie weit weg, reicht eine Meldung pro Sekunde.
- **Gegner haben einen Besitzer.** Alle angreifenden Tiere laufen über ein eigenes Gegner-System: dieselben Körper und Verhaltensweisen wie im Grundspiel, aber mit Nummern, Lebenspunkten und mehreren möglichen Zielen. Der Rechner, in dessen Nähe ein Gegner entsteht, rechnet ihn und schickt seinen Zustand an die Mitspieler in der Nähe (bis etwa 20 m). Die zeigen ihn geglättet.
- **Eine Regie pro Gruppe:** Schwimmen Spieler zusammen, verteilt nur einer die Gegner, damit sie sich nicht verdoppeln. Wer sich absetzt, bekommt seine eigene Regie mit dem Budget für die volle Spielerzahl im Raum.
- **Übergabe:** Pausiert der Besitzer, wechselt er das Fenster, stirbt, schwimmt davon oder verliert die Verbindung, übernimmt der nächste Mitspieler in der Nähe seine Gegner mit dem letzten Stand. Ist niemand in der Nähe, verschwinden sie; es sieht sie ja keiner.
- **Schüsse** sind Ereignisse und fliegen auf jedem Rechner gleich. Der Schütze meldet seine Treffer an den Besitzer des Gegners, der entscheidet und meldet „Versenkt!“ an alle. Ob der eigene Fisch getroffen wurde, entscheidet jeder selbst; so zählt ein Ausweichen, das man gesehen hat.
- **Schwarmgenossen** gehören dem Spieler, zu dessen Schwarm sie gehören. Die anderen sehen sie, wenn sie nah sind, und ihre Schüsse laufen ebenfalls als Ereignisse.
- **Tageszeit:** Der Raum gibt die Uhr vor.

**Warum nicht anders:**
- *Ein Gastgeber für alle* passt nicht zu weit verteilten Spielern. Steine und Boden sind nur rund um die eigene Kamera fest; ein Gastgeber könnte Gegner bei entfernten Spielern nicht richtig steuern, und bei seiner Pause stünde die Welt für alle still.
- *Alle erzeugen dieselben Gegner aus einem gemeinsamen Zufallswert:* Das Grundspiel rechnet mit schwankender Bildrate und würfelt zur Laufzeit. Die Gegner liefen nach Sekunden auseinander, und man müsste doch übertragen. Gemeinsame Zufallswerte gibt es deshalb nur für das, was fest am Fluss liegt.

### Dienst und Kosten

- **Raum-Dienst:** ein Cloudflare Worker mit einem Durable Object pro Raum, für Lobby, Raumcode, Weiterleitung per WebSocket und die Speicherstände der Plätze. Ein Raum wird nach 30 Tagen ohne Spiel gelöscht. Das Spiel selbst bleibt auf Vercel.
- **Datenschutz:** keine Konten, nur Spitznamen. Über den Raum sieht niemand die IP-Adressen der anderen.
- **Kosten:** kostenlos für etwa 7 Raumstunden am Tag zu viert, danach 5 $/Monat plus etwa 0,8 ct pro Raumstunde.
- **Daten:** etwa 110 MB pro Stunde und Spieler, wenn alle zusammen kämpfen, deutlich weniger, wenn sie verteilt sind; mit Sparmodus etwa die Hälfte.
- **Weltweit:** Ihr spielt über Kontinente hinweg. Der Raum steht nahe beim Eröffner; für weit entfernte Mitspieler wird es träger. Stört das, kommen später direkte Verbindungen (WebRTC) dazu.

## 6. Technik

**Fork:** steht: `tscherrie/salmon-survival-extreme` (öffentlich), Vercel-Projekt `salmon-survival-extreme` (https://salmon-survival-extreme.vercel.app; fische-versenken.vercel.app leitet weiter), `upstream` zeigt auf Next. Updates holt `git fetch upstream && git merge upstream/main`. Danach laufen drei Prüfungen:
- ein Paritätstest: Mit ausgeschaltetem Kampf ergibt das Spiel exakt die Fotopunkte von Next;
- ein Schnittstellen-Test: Die Stellen im Grundspiel, auf die der neue Code zugreift, gibt es noch;
- `layout-fingerprint`: Der Fluss liegt wie vorher.

**Konfliktarm einhängen:** main.js ändert sich in 39 von 60 Commits von Next. Deshalb nutzt der neue Code die vorhandene Importmap (index.html:50): `"/src/life.js": "/src/fv/life.js"` leitet den Import auf eine Hülle um. Die lädt das Original über `?base` und umhüllt `update` und `reset`. Ebenso lassen sich touch, brood, save und minimap austauschen. Der Einstieg ist ein kleiner Haken, der auch in Next steht: `src/mods.js` (in Next leer; die Importmap zeigt hier auf `src/fv/mods.js`), dazu init/step/frame-Aufrufe in main.js und ein Getter für die Klang-Busse in sound.js.

**Ein eigenes Gegner-System statt der Räuber des Grundspiels:** Die Räuber des Grundspiels (predators.js, dazu Eisvogel, Reiher und Bär in life.js) kennen nur einen Fisch und einen einzigen gefangenen Lachs, und jeder von ihnen ist teuer zu rechnen. Sie werden deshalb abgeschaltet und durch ein Gegner-System ersetzt, das ihre Körper und Verhaltensweisen übernimmt (anpirschen, lauern, im Rudel einkreisen, verfolgen, Stoßtauchen) und dazu Schwärme für die Horden bringt.
- Es ist von Anfang an koop-fähig: Nummern, Besitzer, mehrere Ziele. Solo besitzt ein Spieler alles.
- predators.js selbst bleibt unverändert, Merges bleiben sauber.

**Neu:**
- `src/fv/`: Kampf, Waffen, Geschosse, Halterungen, Kapseln, Gegner-System und Schwärme, Regisseur, Bosse, Verbündete, Effekte, Klänge, HUD, Texte, Abstimmung.
- `src/net/`: Transport, Protokoll, Lobby, Mitspieler-Fische, Gegner-Besitz und Übergabe.
- `rooms/`: der Cloudflare Worker.

**Basisdateien** (markiert mit `// FV:`):
- index.html: Titel und Importmap
- version.js: Branding
- main.js: Feuer-Eingabe und kleine Koop-Haken: der Tod im Koop (Geschwister ein Stück zurück, Brut-Zähler fürs Team, eigene Gegner übergeben statt löschen), Pause und Fensterwechsel, Stufenwechsel ohne Zeitlupe, eigener Speicherplatz für den Koop
- sound.js: Getter für die Klang-Busse

**Leistung:** Der Basis-Frame liegt headless schon bei 23,5 ms und damit über der Schwelle, ab der die Auflösung sinkt. Der Kampf bekommt daher höchstens 1,5 ms GPU und 1 ms CPU:
- ≤ 80 Gegner und ≤ 300 Geschosse, halb so viel auf Handy und Eco
- Schwärme mit niedrigem Detail, ohne Schatten und nicht im Spiegel
- keine Lichter zur Laufzeit
- Effekte folgen dem Wassernebel

Gemessen wird auf WebGPU, WebGL2 und Eco.

**Versionen:** Ein automatisches Neuladen bei neuer Version gibt es nicht; die Prüfung in main.js greift nur bei einem gebündelten Build, den das Spiel nicht hat. Wer vor einem Push geladen hat, spielt mit dem alten Stand weiter. Darum vergleicht die Koop-Lobby Protokollnummer und Commit.

## 7. Meilensteine

Stand 30.09.2026: M0 und M1 fertig. Aus M2 feuern alle 16 Waffen mit ihren Modi (der Laser mit Puls und Strahl, die Kanone als Geheimwaffe im Wrack und in der Grotte), und alle Gegner der Tabelle 4a außer den Bossen sind im Gegner-System: dazu seit 0.23 Flussbarsch-Rudel, Dorsch, Hecht, Otter, Qualle und Basstölpel. Offen in M2: die fünf weiteren Bosse, der Regisseur mit Arenen, der schießende Schwarm. M3: Koop Teil 1 (Raum-Dienst, Lobby, gemeinsamer Start, Mitspieler sehen) ist seit 0.22 öffentlich.

| | Inhalt | Aufwand | Du testest |
|---|---|---|---|
| **M0** Setup | Repo, Vercel, Branding (erledigt); Importmap-Gerüst, Paritätstest | 1–2 Tage | Das Spiel sieht exakt aus wie Next |
| **M1** Solo-Kern | Zielen, Geschosse, „Versenkt!“, 4 Waffen, das Gegner-System mit den Räubern der ersten 15 Minuten und einfachen Schwärmen, HUD, Klänge, Handy-Auto-Feuer; Kampf nährt das Leben, Kiesbett-Verteidigung, Todesregeln solo | 14–18 Tage | die ersten 15 Minuten bis zum König |
| **M2** Inhalt | 12 Waffen mit Halterungen, zwei Waffenplätze, Kapseln, alle Räuber im Gegner-System, Regisseur mit Arenen, 6 Bosse, schießender Schwarm, Todesregeln, 5 Sprachen | 15–20 Tage | ein ganzes Leben allein |
| **M3** Koop zu zweit | Raum-Dienst, Lobby und Link, gemeinsamer Start, Mitspieler sehen (Fisch, Namensschild, Karte, Pfeile), gemeinsame Brut und Tod mit Aufschließen, Gegner mit Besitzer und Übergabe, Schüsse und Treffer übers Netz, Pause- und Fensterregeln, gleiche Tageszeit, Test mit zwei Browsern und künstlicher Verzögerung | 15–20 Tage | du + Freund bis zum Meer |
| **M4** Zu viert + Politur | vier Spieler, eine Regie pro Gruppe, Bosse einmal pro Raum, Schwarmgenossen im Netz, Wiedereinstieg und Weiterspielen an einem anderen Abend, Datensparmodus, Handys, Endkarte mit Spaß-Auszeichnungen, Dauer- und Lag-Tests | 12–18 Tage | Koop-Abend zu viert |

Gesamt: grob 57–78 Arbeitstage. Vor jeder größeren Etappe wird Next hereingemerged, damit die Unterschiede klein bleiben.

## 8. Entscheidungen (26.09.2026)

- **Name:** Salmon Survival Extreme; Repo und Vercel sind umbenannt, die alte Adresse leitet weiter.
- **Zwei Waffen ab dem Smolt;** die Plätze sind Rücken (links, rechts oder Mitte, je nach Waffe; linke Maustaste) und Bauch (rechte Maustaste).
- **Angenommen:** „Kampf nährt das Leben“ mit Laichwut; Todesabzug 90 %, Rache-Kapsel, Checkpoint nach Bossen; Kiesbett-Verteidigung; Schwierigkeitsgrade statt Vegan-Modus; alle Koop-Regeln aus Teil 5; ein kleiner Haken in Next.
- **Abgelehnt:** „Gepackt!“. Verschlucken bleibt sofortiger Tod.
- **Pause:** Der Fisch steht fest im Wasser, ist aber nicht geschützt.
- **Cloudflare-Konto:** legst du vor M3 an.
- **Spieler:** weltweit.
