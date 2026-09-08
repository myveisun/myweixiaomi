import { useTranslation } from "react-i18next";

const ICON = `${import.meta.env.BASE_URL}logo-icon.png`;

interface BrandMarkProps {
  /** Icon size in px (square). Default 30. */
  icon?: number;
  /** Name font size in px. Default 17. */
  text?: number;
  /** Gap between icon and name in px. Default 9. */
  gap?: number;
  /** Icon corner radius. Defaults to 22% of icon size. */
  radius?: number;
  /** Hide the localized name and render the icon only. */
  iconOnly?: boolean;
}

/**
 * Reusable brand lockup: square logo mark + localized product name
 * (威小蜜AI in zh, VS Agent in en). Used by the sidebar, login, setup
 * wizard header and the mobile top bar.
 */
export default function BrandMark({
  icon = 30,
  text = 17,
  gap = 9,
  radius,
  iconOnly = false,
}: BrandMarkProps) {
  const { t } = useTranslation();
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        minWidth: 0,
        lineHeight: 1,
      }}
    >
      <img
        src={ICON}
        alt=""
        aria-hidden
        draggable={false}
        width={icon}
        height={icon}
        style={{
          display: "block",
          flexShrink: 0,
          objectFit: "contain",
          borderRadius: radius ?? Math.round(icon * 0.22),
        }}
      />
      {!iconOnly && (
        <span
          style={{
            fontSize: text,
            fontWeight: 600,
            color: "var(--fn-text-primary)",
            letterSpacing: "-0.2px",
            whiteSpace: "nowrap",
            flexShrink: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {t("brand.name")}
        </span>
      )}
    </span>
  );
}
