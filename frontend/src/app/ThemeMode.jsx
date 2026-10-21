import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {ThemeProvider,createTheme} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

const Context=createContext(null);
export function useThemeMode(){return useContext(Context)}

export const FONT='"Segoe UI", "Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", Roboto, sans-serif';

// One palette for the whole app (supervisor, engineering and worker screens).
// Industrial-HMI rules: neutral greys at rest; colour only carries meaning —
// alarm = red, ok = green, warn = amber, primary blue only for controls.
// Text/background pairs meet WCAG AA (4.5:1); dark `alarm` was darkened to
// #D63A3F so white text on it passes. Re-check contrast when changing a value.
export const TOKENS={
  light:{
    primary:'#1D5FD1',
    bg:'#F3F5F8', surface:'#FFFFFF', raised:'#F8FAFC', border:'#D8DEE6',
    text:'#101828', muted:'#475467', faint:'#98A2B3',
    alarm:'#D92D20', alarmDeep:'#912018', alarmBg:'#FEF3F2', alarmBorder:'#FECDCA', alarmText:'#B42318',
    ok:'#079455', okBg:'#ECFDF3', okText:'#067647',
    warn:'#DC6803', warnBg:'#FFFAEB', warnText:'#B54708',
    video:'#0B0F14', brandBg:'#E8F0FD', brand:'#1D5FD1',
    nav:'#101828', navText:'#E6EAF0',
    chart:['#1D5FD1','#079455','#DC6803','#7A5AF8','#0E9384','#98A2B3']
  },
  dark:{
    primary:'#4C9AFF',
    bg:'#0B0F14', surface:'#121821', raised:'#18202B', border:'#263040',
    text:'#E6EAF0', muted:'#8A96A8', faint:'#5B6778',
    alarm:'#D63A3F', alarmDeep:'#7A1E22', alarmBg:'#22110F', alarmBorder:'#5C1F24', alarmText:'#FFB4B4',
    ok:'#30A46C', okBg:'#0E1F17', okText:'#3DD68C',
    warn:'#F5A524', warnBg:'#241C0E', warnText:'#F5A524',
    video:'#05080C', brandBg:'#1D3B66', brand:'#8CC0FF',
    nav:'#0E141B', navText:'#E6EAF0',
    chart:['#4C9AFF','#30A46C','#F5A524','#9E8CFC','#2EC4B6','#8A96A8']
  }
};

export function buildTheme(mode){
  const t=TOKENS[mode];
  return createTheme({
    palette:{
      mode,
      primary:{main:t.primary},
      secondary:{main:t.warn},
      error:{main:t.alarm,dark:t.alarmDeep,light:t.alarmBg,contrastText:'#fff'},
      success:{main:t.ok,light:t.okBg,dark:t.okText},
      warning:{main:t.warn,light:t.warnBg,dark:t.warnText},
      background:{default:t.bg,paper:t.surface},
      text:{primary:t.text,secondary:t.muted,disabled:t.faint},
      divider:t.border,
      hmi:t
    },
    shape:{borderRadius:8},
    typography:{fontFamily:FONT,fontSize:14,body1:{fontSize:14}},
    components:{
      MuiCard:{styleOverrides:{root:{borderColor:t.border}}},
      MuiPaper:{styleOverrides:{outlined:{borderColor:t.border}}},
      // Top bars: neutral surface with a hairline, not a saturated colour block.
      MuiAppBar:{defaultProps:{elevation:0,color:'inherit'},styleOverrides:{root:{backgroundColor:t.surface,color:t.text,borderBottom:`1px solid ${t.border}`}}}
    }
  });
}

export default function ThemeMode({children}){
  const [choice,setChoice]=useState(()=>localStorage.getItem('safety-theme')||'light');
  const [system,setSystem]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(()=>{const mq=matchMedia('(prefers-color-scheme: dark)');const listener=e=>setSystem(e.matches);mq.addEventListener('change',listener);return()=>mq.removeEventListener('change',listener)},[]);
  const change=v=>{setChoice(v);localStorage.setItem('safety-theme',v)};
  const dark=choice==='dark'||(choice==='system'&&system);
  const theme=useMemo(()=>buildTheme(dark?'dark':'light'),[dark]);
  return <Context.Provider value={{choice,change}}><ThemeProvider theme={theme}><CssBaseline/>{children}</ThemeProvider></Context.Provider>
}
