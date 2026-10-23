import { Box, Stack, Typography } from "@mui/material";

/** Standard page wrapper: same padding and max width on every admin page. */
export function Page({ children, sx }) {
  return <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1600, mx: "auto", width: "100%", ...sx }}>{children}</Box>;
}

/** Page title (same name as its nav item) with optional right-aligned actions or a status line. */
export default function PageHeader({ title, meta, actions }) {
  return <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" gap={1.5} mb={3}>
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="h5" component="h1">{title}</Typography>
      {meta && <Typography variant="body2" color="text.secondary" mt={0.25}>{meta}</Typography>}
    </Box>
    {actions && <Stack direction="row" gap={1} flexWrap="wrap" alignItems="center">{actions}</Stack>}
  </Stack>;
}
