export const INVOICE_LAYOUT_VARIANTS = [
  "din5008_modern",
  "din5008_classic",
  "din5008_minimal",
  "din5008_compact",
  "din5008_enterprise",
] as const;

export type InvoiceLayoutVariant = typeof INVOICE_LAYOUT_VARIANTS[number];

export const DEFAULT_INVOICE_LAYOUT_VARIANT: InvoiceLayoutVariant = "din5008_modern";

type LayoutSource = "cost_center" | "company" | "system_default";

export type InvoiceLayoutCatalogEntry = {
  id: InvoiceLayoutVariant;
  name: string;
  previewTitle: string;
  description: string;
  preview: {
    accentColor: string;
    fontFamily: string;
    density: "compact" | "comfortable";
    visualStyle: string;
  };
  technical: {
    paperStandard: "DIN 5008";
    pageFormat: "A4";
    windowEnvelopeCompatible: boolean;
    renderEngine: "@react-pdf/renderer";
    eInvoice: {
      format: "ZUGFeRD";
      profileSupport: "MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED";
      embedding: "PDF/A-3 + EN 16931 XML";
    };
  };
};

const CATALOG: Record<InvoiceLayoutVariant, InvoiceLayoutCatalogEntry> = {
  din5008_modern: {
    id: "din5008_modern",
    name: "DIN Modern",
    previewTitle: "Modernes DIN-5008 Layout",
    description: "Ausgewogenes Standardlayout mit klarer Hierarchie und moderner Typografie.",
    preview: {
      accentColor: "#0f172a",
      fontFamily: "Helvetica",
      density: "comfortable",
      visualStyle: "Navy Underline, soft cards, balanced business look",
    },
    technical: {
      paperStandard: "DIN 5008",
      pageFormat: "A4",
      windowEnvelopeCompatible: true,
      renderEngine: "@react-pdf/renderer",
      eInvoice: {
        format: "ZUGFeRD",
        profileSupport: "MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED",
        embedding: "PDF/A-3 + EN 16931 XML",
      },
    },
  },
  din5008_classic: {
    id: "din5008_classic",
    name: "DIN Classic",
    previewTitle: "Klassisches Geschäftsbrief-Layout",
    description: "Serifenbetonte Darstellung für konservative Branchen und formelle Korrespondenz.",
    preview: {
      accentColor: "#342a20",
      fontFamily: "Times-Roman",
      density: "comfortable",
      visualStyle: "Serif, centered headline, traditional letter aesthetic",
    },
    technical: {
      paperStandard: "DIN 5008",
      pageFormat: "A4",
      windowEnvelopeCompatible: true,
      renderEngine: "@react-pdf/renderer",
      eInvoice: {
        format: "ZUGFeRD",
        profileSupport: "MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED",
        embedding: "PDF/A-3 + EN 16931 XML",
      },
    },
  },
  din5008_minimal: {
    id: "din5008_minimal",
    name: "DIN Minimal",
    previewTitle: "Minimalistisches Layout",
    description: "Reduzierte Linien und zurückhaltende Farben bei vollem DIN-5008 Aufbau.",
    preview: {
      accentColor: "#111827",
      fontFamily: "Helvetica",
      density: "comfortable",
      visualStyle: "Ultra-clean, line-focused, reduced visual noise",
    },
    technical: {
      paperStandard: "DIN 5008",
      pageFormat: "A4",
      windowEnvelopeCompatible: true,
      renderEngine: "@react-pdf/renderer",
      eInvoice: {
        format: "ZUGFeRD",
        profileSupport: "MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED",
        embedding: "PDF/A-3 + EN 16931 XML",
      },
    },
  },
  din5008_compact: {
    id: "din5008_compact",
    name: "DIN Compact",
    previewTitle: "Verdichtetes Layout",
    description: "Dichtere Darstellung mit engerem Spacing, gut für längere Positionstabellen.",
    preview: {
      accentColor: "#0b3a53",
      fontFamily: "Helvetica",
      density: "compact",
      visualStyle: "Dense data layout with compact chips and tight rhythm",
    },
    technical: {
      paperStandard: "DIN 5008",
      pageFormat: "A4",
      windowEnvelopeCompatible: true,
      renderEngine: "@react-pdf/renderer",
      eInvoice: {
        format: "ZUGFeRD",
        profileSupport: "MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED",
        embedding: "PDF/A-3 + EN 16931 XML",
      },
    },
  },
  din5008_enterprise: {
    id: "din5008_enterprise",
    name: "DIN Enterprise",
    previewTitle: "Corporate Enterprise Layout",
    description: "Stärkerer Kontrast und markante Flächen für corporate-lastige Markenwirkung.",
    preview: {
      accentColor: "#0b5fff",
      fontFamily: "Helvetica",
      density: "comfortable",
      visualStyle: "Strong brand bars, high-contrast table header, corporate",
    },
    technical: {
      paperStandard: "DIN 5008",
      pageFormat: "A4",
      windowEnvelopeCompatible: true,
      renderEngine: "@react-pdf/renderer",
      eInvoice: {
        format: "ZUGFeRD",
        profileSupport: "MINIMUM, BASIC WL, BASIC, EN 16931 (COMFORT), EXTENDED",
        embedding: "PDF/A-3 + EN 16931 XML",
      },
    },
  },
};

export function getInvoiceLayoutCatalog(): InvoiceLayoutCatalogEntry[] {
  return INVOICE_LAYOUT_VARIANTS.map((id) => CATALOG[id]);
}

export function getInvoiceLayoutById(id: InvoiceLayoutVariant): InvoiceLayoutCatalogEntry {
  return CATALOG[id];
}

export function isInvoiceLayoutVariant(value: unknown): value is InvoiceLayoutVariant {
  if (typeof value !== "string") return false;
  return (INVOICE_LAYOUT_VARIANTS as readonly string[]).includes(value);
}

export function resolveInvoiceLayoutVariant(
  companyVariant: unknown,
  costCenterVariant: unknown
): { variant: InvoiceLayoutVariant; source: LayoutSource } {
  if (isInvoiceLayoutVariant(costCenterVariant)) {
    return { variant: costCenterVariant, source: "cost_center" };
  }
  if (isInvoiceLayoutVariant(companyVariant)) {
    return { variant: companyVariant, source: "company" };
  }
  return { variant: DEFAULT_INVOICE_LAYOUT_VARIANT, source: "system_default" };
}
