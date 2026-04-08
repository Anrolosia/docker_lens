import { createTheme } from '@mui/material/styles';

export function buildTheme(darkMode = false) {
  return createTheme({
    palette: {
      mode: darkMode ? 'dark' : 'light',
      primary: { main: '#03a9f4' },
      secondary: { main: '#ff9800' },
      success: { main: '#4caf50' },
    },
    components: {
      MuiAccordion: {
        styleOverrides: {
          root: {
            border: '1px solid rgba(128,128,128,.2)',
            boxShadow: 'none',
            '&:not(:last-child)': { borderBottom: 0 },
            '&::before': { display: 'none' },
            '&.Mui-expanded': { margin: 'auto' },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: {
            backgroundColor: 'rgba(128,128,128,.05)',
            borderBottom: '1px solid rgba(128,128,128,.2)',
            minHeight: 48,
            '&.Mui-expanded': { minHeight: 48 },
          },
          content: { '&.Mui-expanded': { margin: '12px 0' } },
        },
      },
      MuiAccordionDetails: {
        styleOverrides: { root: { padding: 0 } },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            '&.Mui-selected': { backgroundColor: 'rgba(3, 169, 244, 0.12)' },
          },
        },
      },
    },
  });
}

export default buildTheme;
