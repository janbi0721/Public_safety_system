import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

function normalizeBox(bbox) {
  if (!bbox) return null;
  const { x1, y1, x2, y2 } = bbox;
  if ([x1, y1, x2, y2].some((v) => typeof v !== "number")) return null;
  return {
    left: `${x1 * 100}%`,
    top: `${y1 * 100}%`,
    width: `${Math.max(0, x2 - x1) * 100}%`,
    height: `${Math.max(0, y2 - y1) * 100}%`
  };
}

export default function DetectionOverlay({ detections = [], alerts = [] }) {
  return (
    <Box sx={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {detections.map((detection, index) => {
        const box = normalizeBox(detection.bbox);
        if (!box) return null;
        const label = detection.className || `class-${detection.classId ?? index}`;
        const confidence = Number(detection.confidence || 0);
        const isPerson = label.toLowerCase() === "person";
        const isHelmet = label.toLowerCase().includes("helmet") || label.toLowerCase().includes("hardhat");

        return (
          <Box
            key={`d-${label}-${detection.trackId ?? index}`}
            sx={{
              position: "absolute",
              ...box,
              border: "2px solid",
              borderColor: isHelmet ? "success.main" : isPerson ? "info.main" : "warning.main",
              borderRadius: 1,
              boxSizing: "border-box"
            }}>
            <Chip
              size="small"
              label={`${label}${detection.trackId != null ? ` #${detection.trackId}` : ""} ${(confidence * 100).toFixed(0)}%`}
              sx={{
                position: "absolute",
                left: -2,
                top: 0,
                transform: "translateY(-100%)",
                borderBottomLeftRadius: 0,
                bgcolor: "rgba(15,23,42,.9)",
                color: "common.white",
                height: 24,
                "& .MuiChip-label": { px: 1, fontSize: 11 }
              }}
            />
          </Box>
        );
      })}

      {alerts.map((alert, index) => {
        const box = normalizeBox(alert.bbox);
        if (!box) return null;
        return (
          <Box
            key={`a-${alert.eventId ?? alert.trackId ?? index}`}
            sx={{
              position: "absolute",
              ...box,
              border: "3px solid",
              borderColor: "error.main",
              borderRadius: 1,
              boxSizing: "border-box"
            }}>
            <Chip
              size="small"
              color="error"
              label={alert.message || alert.eventType || "安全警示"}
              sx={{
                position: "absolute",
                left: -3,
                bottom: 0,
                transform: "translateY(100%)",
                maxWidth: 280,
                "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" }
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}
