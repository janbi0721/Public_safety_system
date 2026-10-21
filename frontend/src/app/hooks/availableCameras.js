import {useEffect,useState} from 'react';
import {api} from '../services/api';
export function useAvailableCameras(){
 const [cameras,setCameras]=useState([]);const [selected,setSelected]=useState('');
 useEffect(()=>{let alive=true;const refresh=()=>api.publicCameras().then(r=>{
   if(!alive)return;const list=r.cameras||[];setCameras(list);
   setSelected(old=>list.some(c=>c.camera_id===old)?old:(list[0]?.camera_id||''));
 }).catch(()=>{if(alive){setCameras([]);setSelected('')}});
 refresh();const interval=setInterval(refresh,3000);return()=>{alive=false;clearInterval(interval)};
 },[]);
 return {cameras,selected,setSelected};
}
