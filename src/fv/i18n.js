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
  [
    "<b>Feuer frei!</b> Deine Waffe feuert von selbst, sobald ein Feind im Visier und in Reichweite ist. Alles, was kein Lachs ist, will dich fressen.",
    "<b>Open fire!</b> Your weapon fires by itself as soon as an enemy is in your sights and in reach. Everything that is not a salmon wants to eat you.",
    "<b>开火！</b>只要有敌人进入准星和射程，你的武器就会自动开火。凡不是鲑鱼的，都想吃掉你。",
    "<b>撃て！</b>敵が照準に入って射程内に来ると、武器が自動で撃つ。サケ以外はみんな、きみを食べようとしている。",
    "<b>Огън!</b> Оръжието ти стреля само, щом враг е на мушка и в обсег. Всичко, което не е сьомга, иска да те изяде.",
  ],
  ["Linke Maustaste: schießen", "Left mouse button: shoot", "鼠标左键：射击", "左クリック：撃つ", "Ляв бутон на мишката: стреляй"],
  [
    "<b>Feuer frei!</b> Die linke Maustaste schießt mit deiner Waffe, die Leertaste bleibt Spurt, Biss und Sprung. Alles, was kein Lachs ist, will dich fressen.",
    "<b>Open fire!</b> The left mouse button fires your weapon; Space is still dash, bite and leap. Everything that is not a salmon wants to eat you.",
    "<b>开火！</b>鼠标左键用你的武器射击，空格键仍是冲刺、咬和跳跃。凡不是鲑鱼的，都想吃掉你。",
    "<b>撃て！</b>左クリックで武器を撃つ。スペースはこれまでどおりダッシュ、かみつき、ジャンプ。サケ以外はみんな、きみを食べようとしている。",
    "<b>Огън!</b> Левият бутон на мишката стреля с оръжието ти, интервалът остава спринт, захапка и скок. Всичко, което не е сьомга, иска да те изяде.",
  ],
  ["Von einer jungen Forelle totgebissen", "Bitten to death by a young trout", "被一条小鳟鱼咬死", "若いマスにかみ殺された", "Изхапана до смърт от млада пъстърва"],
];

for (const [de, en, zh, ja, bg] of WORDS) {
  EN[de] = en;
  ZH[en] = zh;
  JA[en] = ja;
  BG[en] = bg;
}
