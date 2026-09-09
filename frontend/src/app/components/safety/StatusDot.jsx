import Box from "@mui/material/Box";

export default function StatusDot({ online, size = 9 }) {
  return (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-block",
        bgcolor: online ? "success.main" : "error.main",
        boxShadow: online ? "0 0 0 3px rgba(46,125,50,.12)" : "none"
      }}
    />
  );
}
