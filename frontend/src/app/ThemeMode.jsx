import {createContext,useContext,useEffect,useMemo,useState} from 'react';
import {ThemeProvider,createTheme} from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
const Context=createContext(null);
export function useThemeMode(){return useContext(Context)}
export default function ThemeMode({children}){
  const [choice,setChoice]=useState(()=>localStorage.getItem('safety-theme')||'light');
  const [system,setSystem]=useState(()=>matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(()=>{const mq=matchMedia('(prefers-color-scheme: dark)');const listener=e=>setSystem(e.matches);mq.addEventListener('change',listener);return()=>mq.removeEventListener('change',listener)},[]);
  const change=v=>{setChoice(v);localStorage.setItem('safety-theme',v)};
  const dark=choice==='dark'||(choice==='system'&&system);
  const theme=useMemo(()=>createTheme({palette:{mode:dark?'dark':'light',primary:{main:dark?'#60a5fa':'#1976d2'},secondary:{main:'#ffaf38'},error:{main:'#e53950'},background:dark?{default:'#101827',paper:'#1b293d'}:{default:'#f4f6fa',paper:'#fff'}},shape:{borderRadius:10},typography:{fontSize:14,body1:{fontSize:14}}}),[dark]);
  return <Context.Provider value={{choice,change}}><ThemeProvider theme={theme}><CssBaseline/>{children}</ThemeProvider></Context.Provider>
}
