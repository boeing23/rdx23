import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#861F41', // Virginia Tech Maroon
      light: '#a04e6b',
      dark: '#5e0d29',
    },
    secondary: {
      main: '#f50057',
    },
    background: {
      default: '#f5f5f5',
    },
  },
  typography: {
    fontFamily: [
      '"Uber Move"',
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif',
      '"Apple Color Emoji"',
      '"Segoe UI Emoji"',
      '"Segoe UI Symbol"',
    ].join(','),
    h1: {
      fontFamily: '"Uber Move", sans-serif',
      fontWeight: 700,
    },
    h2: {
      fontFamily: '"Uber Move", sans-serif',
      fontWeight: 700,
    },
    h3: {
      fontFamily: '"Uber Move", sans-serif',
      fontWeight: 700,
    },
    h4: {
      fontFamily: '"Uber Move", sans-serif',
      fontWeight: 700,
    },
    h5: {
      fontFamily: '"Uber Move", sans-serif',
      fontWeight: 600,
    },
    h6: {
      fontFamily: '"Uber Move", sans-serif',
      fontWeight: 600,
    },
    button: {
      fontFamily: '"Uber Move", sans-serif',
      fontWeight: 500,
      textTransform: 'none',
    }
  },
});

export default theme; 