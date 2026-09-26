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
  ["Kampfmesser", "Combat knife", "战斗刀", "コンバットナイフ", "Боен нож"],
  ["Maschinenpistole", "Submachine gun", "冲锋枪", "サブマシンガン", "Автомат"],
];

for (const [de, en, zh, ja, bg] of WORDS) {
  EN[de] = en;
  ZH[en] = zh;
  JA[en] = ja;
  BG[en] = bg;
}
