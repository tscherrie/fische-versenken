// Extreme's words in the game's languages, laid into its tables when the module loads
// (before the first text is looked up, so nothing is cached untranslated). German is the
// source; English is keyed by the German, the others by the English, as in the base game.

import { EN } from "../i18n-en.js";
import { ZH } from "../i18n-zh.js";
import { JA } from "../i18n-ja.js";
import { BG } from "../i18n-bg.js";

// [German, English, Chinese, Japanese, Bulgarian]
const WORDS = [
  ["Treffer!", "Hit!", "命中！", "命中！", "Попадение!"],
  ["Versenkt!", "Sunk!", "击沉！", "撃沈！", "Потопен!"],
  ["Überhitzt", "Overheated", "过热", "オーバーヒート", "Прегряване"],
  ["Linke Maustaste", "Left mouse button", "鼠标左键", "左クリック", "Ляв бутон на мишката"],
  ["Rechte Maustaste", "Right mouse button", "鼠标右键", "右クリック", "Десен бутон на мишката"],
  ["Piu-Piu-Laser", "Pew-pew laser", "啾啾激光", "ピュンピュンレーザー", "Пиу-пиу лазер"],
  // The weapons.
  ["Kompaktlaser", "Compact Laser", "紧凑型激光器", "コンパクトレーザー", "Компактен лазер"],
  ["Abgesägte Doppelflinte", "Sawn-Off Double Barrel", "短管双管猎枪", "ソードオフ・ダブルバレル", "Рязана двуцевка"],
  ["Revolver-Granatwerfer", "Revolver Grenade Launcher", "转轮式榴弹发射器", "リボルバー式グレネードランチャー", "Револверен гранатомет"],
  ["Katana", "Katana", "武士刀", "日本刀", "Катана"],
  ["Flammenwerfer", "Flamethrower", "火焰喷射器", "火炎放射器", "Огнехвъргачка"],
  ["Konter!", "Counter!", "反击！", "カウンター！", "Контра!"],
  ["Nachladen", "Reloading", "装填中", "リロード中", "Презареждане"],
  ["Leer", "Empty", "燃料耗尽", "燃料切れ", "Празно"],
  // Co-op: the lobby.
  ["Zu zweit bis zu viert spielen", "Play with two to four", "两到四人一起玩", "2〜4人で遊ぶ", "Игра за двама до четирима"],
  ["Koop-Raum eröffnen", "Open a co-op room", "开一个合作房间", "協力ルームを開く", "Отвори стая за кооп"],
  ["Der Raum-Dienst ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.", "The room service cannot be reached right now. Please try again in a moment.", "房间服务暂时无法连接，请稍后再试。", "ルームサービスに接続できません。少し待ってからもう一度お試しください。", "Услугата за стаи в момента не е достъпна. Опитай отново след малко."],
  ["Koop-Raum", "Co-op room", "合作房间", "協力ルーム", "Кооп стая"],
  ["Link kopieren", "Copy link", "复制链接", "リンクをコピー", "Копирай връзката"],
  ["Kopiert", "Copied", "已复制", "コピーしました", "Копирано"],
  ["Dein Name", "Your name", "你的名字", "あなたの名前", "Твоето име"],
  // (The name a player has until they pick their own.)
  ["Lachs", "Salmon", "鲑鱼", "サケ", "Сьомга"],
  ["Bereit", "Ready", "准备好了", "準備OK", "Готов"],
  ["Doch nicht", "Not yet", "还没", "やっぱりまだ", "Още не"],
  ["Verbinde mit dem Raum …", "Connecting to the room …", "正在连接房间……", "ルームに接続中……", "Свързване със стаята …"],
  ["Der Raum ist voll: vier spielen schon.", "The room is full: four are playing already.", "房间已满：已经有四人在玩。", "ルームは満員です：すでに4人が遊んでいます。", "Стаята е пълна: вече играят четирима."],
  ["Ihr habt verschiedene Versionen: bitte alle neu laden.", "You are on different versions: everyone please reload.", "你们的版本不同：请大家刷新页面。", "バージョンが違います：全員ページを再読み込みしてください。", "Имате различни версии: моля, всички презаредете."],
  ["Wenn alle bereit sind, geht es los.", "When everyone is ready, it begins.", "所有人准备好后就开始。", "全員の準備ができたら始まります。", "Когато всички са готови, започваме."],
  ["Das Spiel läuft schon: du steigst gleich ein.", "The game is on already: you join in a moment.", "游戏已经开始：你马上加入。", "ゲームはもう始まっています：すぐに参加します。", "Играта вече тече: влизаш след миг."],
  ["du", "you", "你", "あなた", "ти"],
  ["Gastgeber", "host", "房主", "ホスト", "домакин"],
  ["weg", "away", "离开", "不在", "няма го"],
  ["andere Version", "other version", "版本不同", "別のバージョン", "друга версия"],
  ["bereit", "ready", "已准备", "準備OK", "готов"],
  ["wartet", "waiting", "等待中", "待機中", "чака"],
  ["Du spielst in diesem Raum schon in einem anderen Fenster.", "You are already playing in this room in another window.", "你已在另一个窗口中进入这个房间。", "このルームには別のウィンドウですでに参加しています。", "Вече играеш в тази стая в друг прозорец."],
  ["Der Fluss entsteht noch …", "The river is still being built …", "河流还在生成……", "川をまだ作っています……", "Реката още се изгражда …"],
  ["Im Koop läuft die Welt weiter: dein Fisch hält still, ist aber nicht geschützt.", "In co-op the world keeps going: your fish holds still, but it is not protected.", "合作模式下世界不会停下：你的鱼会原地不动，但不受保护。", "協力プレイでは世界は止まりません：あなたの魚はその場に留まりますが、守られてはいません。", "В кооп светът продължава: рибата ти стои на място, но не е защитена."],
  // The title card: the settings' labels, the difficulty levels (their lines are the
  // buttons' tooltips), and the note on the recommended graphics step.
  ["Schwierigkeit", "Difficulty", "难度", "難易度", "Трудност"],
  ["Sprache", "Language", "语言", "言語", "Език"],
  ["Tourist", "Tourist", "游客", "ツーリスト", "Турист"],
  ["Normal", "Normal", "普通", "ノーマル", "Нормално"],
  ["Serious", "Serious", "严肃", "シリアス", "Сериозно"],
  ["Die Gegner treffen kaum, verschluckt wirst du nicht.", "Enemies hardly ever hit you, and nothing swallows you whole.", "敌人几乎打不中你，你也不会被整条吞下。", "敵の攻撃はほとんど当たらず、丸呑みにもされない。", "Враговете почти не те улучват и никой не те поглъща цяла."],
  ["So, wie es gedacht ist.", "The way it is meant to be.", "游戏本来的样子。", "本来の想定どおり。", "Така, както е замислено."],
  ["Mehr Gegner, die härter zuschlagen und mehr aushalten.", "More enemies, who hit harder and take more to sink.", "更多敌人，下手更狠，也更耐打。", "敵が増え、攻撃はより激しく、よりしぶとい。", "Повече врагове, които удрят по-силно и издържат повече."],
  ["Empfohlen für dieses Gerät.", "Recommended for this device.", "推荐用于此设备。", "このデバイスにおすすめ。", "Препоръчано за това устройство."],
  // (In a co-op room, where a reload starts the fish afresh.)
  ["Ein Wechsel lädt das Spiel neu.", "Switching reloads the game.", "切换会重新加载游戏。", "切り替えるとゲームを読み込み直します。", "Смяната презарежда играта."],
  // The weapon cards' places, on a phone.
  ["Rücken", "Back", "背部", "背中", "Гръб"],
  ["Bauch", "Belly", "腹部", "腹", "Корем"],
  [
    "<b>Feuer frei!</b> Deine Waffe feuert von selbst, sobald ein Feind im Visier und in Reichweite ist. Alles, was kein Lachs ist, will dich fressen.",
    "<b>Open fire!</b> Your weapon fires by itself as soon as an enemy is in your sights and in reach. Everything that is not a salmon wants to eat you.",
    "<b>开火！</b>只要有敌人进入准星和射程，你的武器就会自动开火。凡不是鲑鱼的，都想吃掉你。",
    "<b>撃て！</b>敵が照準に入って射程内に来ると、武器が自動で撃つ。サケ以外はみんな、きみを食べようとしている。",
    "<b>Огън!</b> Оръжието ти стреля само, щом враг е на мушка и в обсег. Всичко, което не е сьомга, иска да те изяде.",
  ],
  ["Linksklick: schießen", "Left click: shoot", "左键：射击", "左クリック：撃つ", "Ляв клик: стреляй"],
  [
    "<b>Feuer frei!</b> Die linke Maustaste schießt mit deiner Waffe, die Leertaste bleibt Spurt, Biss und Sprung. Alles, was kein Lachs ist, will dich fressen.",
    "<b>Open fire!</b> The left mouse button fires your weapon; Space is still dash, bite and leap. Everything that is not a salmon wants to eat you.",
    "<b>开火！</b>鼠标左键用你的武器射击，空格键仍是冲刺、咬和跳跃。凡不是鲑鱼的，都想吃掉你。",
    "<b>撃て！</b>左クリックで武器を撃つ。スペースはこれまでどおりダッシュ、かみつき、ジャンプ。サケ以外はみんな、きみを食べようとしている。",
    "<b>Огън!</b> Левият бутон на мишката стреля с оръжието ти, интервалът остава спринт, захапка и скок. Всичко, което не е сьомга, иска да те изяде.",
  ],
  ["Von einer jungen Forelle erstochen", "Stabbed by a young trout", "被一条小鳟鱼刺死", "若いマスに刺された", "Намушкана от млада пъстърва"],
  ["Von einer Groppe niedergeschossen", "Shot down by a bullhead", "被一条杜父鱼击倒", "カジカに撃ち倒された", "Застреляна от главоч"],
  ["Von einer Bachforelle erschossen", "Shot dead by a brown trout", "被一条褐鳟射杀", "ブラウントラウトに射殺された", "Застреляна от балканска пъстърва"],
  ["Abgesägte Schrotflinte", "Sawn-off shotgun", "短管猎枪", "ソードオフ・ショットガン", "Рязана пушка"],
  // The perch, the cod and the pike (their names are the base game's already).
  ["Pistole", "Pistol", "手枪", "拳銃", "Пистолет"],
  ["Pumpgun", "Pump-action shotgun", "泵动式霰弹枪", "ポンプアクション・ショットガン", "Помпена пушка"],
  ["Elefantenbüchse", "Elephant gun", "猎象枪", "エレファントガン", "Пушка за слонове"],
  ["Von Flussbarschen erschossen", "Shot dead by perch", "被河鲈射杀", "パーチに射殺された", "Застреляна от костури"],
  ["Von einem Dorsch mit der Pumpgun erlegt", "Brought down by a cod with a pump-action shotgun", "被一条鳕鱼用泵动式霰弹枪击毙", "タラにポンプアクション・ショットガンで仕留められた", "Повалена от треска с помпена пушка"],
  ["Von einem Hecht aus dem Hinterhalt erschossen", "Shot from ambush by a pike", "被一条埋伏的白斑狗鱼射杀", "待ち伏せていたパイクに射殺された", "Застреляна от засада от щука"],
  ["Libellenlarve", "Dragonfly larva", "蜻蜓幼虫", "ヤゴ", "Ларва на водно конче"],
  ["Gelbrandkäferlarve", "Diving beetle larva", "龙虱幼虫", "ゲンゴロウの幼虫", "Ларва на плавач"],
  ["Von einer Libellenlarve gepackt", "Seized by a dragonfly larva", "被一只蜻蜓幼虫抓住", "ヤゴに捕まった", "Хваната от ларва на водно конче"],
  ["Von einer Gelbrandkäferlarve zerrissen", "Torn apart by a diving beetle larva", "被一只龙虱幼虫撕碎", "ゲンゴロウの幼虫に引き裂かれた", "Разкъсана от ларва на плавач"],
  ["Springmesser", "Switchblade", "弹簧刀", "飛び出しナイフ", "Автоматичен нож"],
  ["Nagelpistole", "Nail gun", "射钉枪", "ネイルガン", "Пистолет за пирони"],
  ["Von einer Gelbrandkäferlarve festgenagelt", "Nailed by a diving beetle larva", "被一只龙虱幼虫钉住", "ゲンゴロウの幼虫に釘付けにされた", "Закована от ларва на плавач"],
  [
    "<b>Larven im Kies!</b> Libellen- und Gelbrandkäferlarven kriechen auf die Brut zu. Halt dich mit S im Kies fest und schieß sie mit der linken Maustaste weg.",
    "<b>Larvae in the gravel!</b> Dragonfly and diving beetle larvae are crawling toward the brood. Hold on in the gravel with S and shoot them away with the left mouse button.",
    "<b>砾石里有幼虫！</b>蜻蜓幼虫和龙虱幼虫正朝鱼苗爬来。按 S 抓紧砾石，用鼠标左键把它们打掉。",
    "<b>砂利に幼虫！</b>ヤゴとゲンゴロウの幼虫が稚魚に這い寄ってくる。S で砂利にしがみつき、左クリックで撃ち払え。",
    "<b>Ларви в чакъла!</b> Ларви на водни кончета и плавачи пълзят към малките. Задръж се в чакъла с S и ги отстреляй с левия бутон на мишката.",
  ],
  ["Der alte König", "The old king", "老国王", "老いた王", "Старият крал"],
  ["Minigun", "Minigun", "转管机枪", "ミニガン", "Миниган"],
  ["Vom alten König gefressen", "Eaten by the old king", "被老国王吃掉", "老いた王に食われた", "Изядена от стария крал"],
  ["Vom alten König durchsiebt", "Riddled by the old king", "被老国王打成筛子", "老いた王に蜂の巣にされた", "Надупчена от стария крал"],
  ["Der alte König ist versenkt!", "The old king is sunk!", "老国王被击沉了！", "老いた王を撃沈した！", "Старият крал е потопен!"],
  ["Das Katana, das er bewacht hat, gehört dir.", "The katana he guarded is yours.", "他守护的武士刀归你了。", "彼が守っていた刀はきみのものだ。", "Катаната, която пазеше, е твоя."],
  ["Neue Waffe", "New weapon", "新武器", "新しい武器", "Ново оръжие"],
  ["Kampfmesser", "Combat knife", "战斗刀", "コンバットナイフ", "Боен нож"],
  ["Maschinenpistole", "Submachine gun", "冲锋枪", "サブマシンガン", "Автомат"],
  // The otter (its name, "Otter", the base game's tables have already).
  ["Machete", "Machete", "砍刀", "マチェーテ", "Мачете"],
  ["Von einem Otter mit der Machete zerhackt", "Hacked to pieces by an otter with a machete", "被一只水獭用砍刀砍碎", "カワウソにマチェーテで切り刻まれた", "Насечена с мачете от видра"],
  // The sea's enemies: the jellyfish with its sea mine, the gannet with its bombs.
  ["Qualle", "Jellyfish", "水母", "クラゲ", "Медуза"],
  ["Seemine", "Sea mine", "水雷", "機雷", "Морска мина"],
  ["Von einer Qualle mit Seemine zerrissen", "Torn apart by a jellyfish with a sea mine", "被一只挂着水雷的水母炸碎", "機雷を抱えたクラゲに引き裂かれた", "Разкъсана от медуза с морска мина"],
  ["Basstölpel", "Gannet", "鲣鸟", "カツオドリ", "Рибояд"],
  ["Fliegerbomben", "Aerial bombs", "航空炸弹", "航空爆弾", "Авиобомби"],
  ["Von einem Basstölpel mit Fliegerbomben zerfetzt", "Blown to pieces by a gannet with aerial bombs", "被一只带着航空炸弹的鲣鸟炸成碎片", "航空爆弾を抱えたカツオドリに木っ端みじんにされた", "Разкъсана на парчета от рибояд с авиобомби"],
];

for (const [de, en, zh, ja, bg] of WORDS) {
  EN[de] = en;
  ZH[en] = zh;
  JA[en] = ja;
  BG[en] = bg;
}
