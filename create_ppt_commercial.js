const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const FA = require("react-icons/fa");

function renderSvg(Icon, color, size = 256) {
  return ReactDOMServer.renderToStaticMarkup(React.createElement(Icon, { color, size: String(size) }));
}
async function iconPng(Icon, color, size = 256) {
  const buf = await sharp(Buffer.from(renderSvg(Icon, color, size))).png().toBuffer();
  return "image/png;base64," + buf.toString("base64");
}

const WHITE     = "FFFFFF";
const TEXT_DARK  = "1A1A1A";
const TEXT_BODY  = "3D3D3D";
const TEXT_MUTED = "888888";

const CORAL     = "FF6B6B";
const TANGERINE = "EA580C";
const PLUM      = "7E22CE";
const EMERALD   = "059669";
const MAGENTA   = "DB2777";

const W = 13.3;
const H = 7.5;

async function main() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";

  const I = {
    search: await iconPng(FA.FaSearchDollar, "#FFFFFF"),
    doc:    await iconPng(FA.FaFileContract, "#FFFFFF"),
    hat:    await iconPng(FA.FaHardHat, "#FFFFFF"),
    chart:  await iconPng(FA.FaChartBar, "#FFFFFF"),
    hand:   await iconPng(FA.FaHandshake, "#FFFFFF"),
  };

  const s = pres.addSlide();
  s.background = { color: WHITE };

  // Title
  s.addText("MANINOS AI", {
    x: 0.5, y: 0.25, w: 4, h: 0.35,
    fontSize: 12, fontFace: "Trebuchet MS", color: MAGENTA, bold: true,
    charSpacing: 4, align: "left", margin: 0
  });
  s.addText("Automatizaciones Clave", {
    x: 0.5, y: 0.55, w: 8, h: 0.55,
    fontSize: 28, fontFace: "Trebuchet MS", color: TEXT_DARK, bold: true, align: "left", margin: 0
  });

  // 5 cards — top row 3, bottom row 2 centered
  const cards = [
    {
      icon: I.search, color: CORAL, title: "Busqueda Inteligente",
      items: [
        "7+ fuentes escaneadas cada 6 horas",
        "Filtros automaticos: precio, zona, rentabilidad",
        "Elimina duplicados entre plataformas",
        "Extrae datos de fotos con vision artificial",
      ]
    },
    {
      icon: I.doc, color: TANGERINE, title: "Documentos Automaticos",
      items: [
        "Contratos generados al instante",
        "Datos rellenados automaticamente",
        "Titulos de transferencia listos para firmar",
        "Monitoreo de cambios en registros oficiales",
      ]
    },
    {
      icon: I.hat, color: PLUM, title: "Renovaciones con IA",
      items: [
        "Comandos de voz en campo",
        "Fotos analizadas por IA → checklist automatico",
        "Estimacion inteligente de costos",
        "Flujo de aprobacion gerencial",
      ]
    },
    {
      icon: I.chart, color: EMERALD, title: "Contabilidad Inteligente",
      items: [
        "Conciliacion bancaria automatica",
        "Estados financieros en tiempo real",
        "Rentabilidad desglosada por propiedad",
        "Gastos recurrentes + trazabilidad total",
      ]
    },
    {
      icon: I.hand, color: MAGENTA, title: "Portal de Inversores",
      items: [
        "6 fases: Analizar → Firmar → Gestionar → Fondear",
        "Alertas de pago y morosidad automaticas",
        "Reportes financieros para inversores",
        "Verificacion de identidad y scoring",
      ]
    },
  ];

  const cardW = 3.9;
  const cardH = 5.4;
  const gap = 0.25;

  // Row 1: 3 cards
  const row1X = (W - (3 * cardW + 2 * gap)) / 2;
  // Row 2: 2 cards centered
  const row2X = (W - (2 * cardW + 1 * gap)) / 2;

  const positions = [];
  for (let i = 0; i < 3; i++) positions.push({ x: row1X + i * (cardW + gap), y: 1.35 });
  for (let i = 0; i < 2; i++) positions.push({ x: row2X + i * (cardW + gap), y: 1.35 });

  // Actually all 5 in one row is better for a single slide — let's do 5 columns
  const allW = 2.38;
  const allH = 5.7;
  const allGap = 0.18;
  const allStartX = (W - (5 * allW + 4 * allGap)) / 2;
  const allY = 1.35;

  for (let i = 0; i < 5; i++) {
    const c = cards[i];
    const cx = allStartX + i * (allW + allGap);

    // Card background — light tinted bg
    s.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: allY, w: allW, h: allH,
      fill: { color: "F9FAFB" },
      shadow: { type: "outer", blur: 8, offset: 2, angle: 150, color: "000000", opacity: 0.04 }
    });

    // Color header strip
    s.addShape(pres.shapes.RECTANGLE, {
      x: cx, y: allY, w: allW, h: 1.15,
      fill: { color: c.color }
    });

    // Icon
    s.addImage({ data: c.icon, x: cx + (allW - 0.4) / 2, y: allY + 0.15, w: 0.4, h: 0.4 });

    // Title on color strip
    s.addText(c.title, {
      x: cx + 0.1, y: allY + 0.6, w: allW - 0.2, h: 0.45,
      fontSize: 11, fontFace: "Trebuchet MS", color: WHITE, bold: true, align: "center", margin: 0
    });

    // Bullet items
    let itemY = allY + 1.35;
    for (const item of c.items) {
      s.addText(item, {
        x: cx + 0.15, y: itemY, w: allW - 0.3, h: 1.0,
        fontSize: 9.5, fontFace: "Calibri", color: TEXT_BODY, align: "left", margin: 0,
        lineSpacingMultiple: 1.25
      });
      itemY += 1.05;
    }
  }

  // Footer
  s.addText("RAMA AI  ·  Automatizaciones inteligentes para negocios inmobiliarios", {
    x: 0.5, y: 7.1, w: 8, h: 0.25,
    fontSize: 8, fontFace: "Calibri", color: TEXT_MUTED, align: "left", margin: 0
  });

  const out = "/Users/mariasebares/Documents/RAMA_AI/maninos-ai/Maninos_AI_Automations.pptx";
  await pres.writeFile({ fileName: out });
  console.log("Saved: " + out);
}

main().catch(console.error);
