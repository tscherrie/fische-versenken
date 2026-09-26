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
  ["Linke Maustaste: schießen", "Left mouse button: shoot", "鼠标左键：射击", "左クリック：撃つ", "Ляв бутон на мишката: стреляй"],
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
  ["Libellenlarve", "Dragonfly larva", "蜻蜓幼虫", "ヤゴ", "Ларва на водно конче"],
  ["Gelbrandkäferlarve", "Diving beetle larva", "龙虱幼虫", "ゲンゴロウの幼虫", "Ларва на плавач"],
  ["Von einer Libellenlarve gepackt", "Seized by a dragonfly larva", "被一只蜻蜓幼虫抓住", "ヤゴに捕まった", "Хваната от ларва на водно конче"],
  ["Von einer Gelbrandkäferlarve zerrissen", "Torn apart by a diving beetle larva", "被一只龙虱幼虫撕碎", "ゲンゴロウの幼虫に引き裂かれた", "Разкъсана от ларва на плавач"],
  ["Fangmaske", "Grasping mask", "捕获面罩", "捕獲マスク", "Хватателна маска"],
  ["Saugzangen", "Sucking jaws", "吸管颚", "吸い込み顎", "Смучещи челюсти"],
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
  ["Kampfmesser", "Combat knife", "战斗刀", "コンバットナイフ", "Боен нож"],
  ["Maschinenpistole", "Submachine gun", "冲锋枪", "サブマシンガン", "Автомат"],
];

for (const [de, en, zh, ja, bg] of WORDS) {
  EN[de] = en;
  ZH[en] = zh;
  JA[en] = ja;
  BG[en] = bg;
}
