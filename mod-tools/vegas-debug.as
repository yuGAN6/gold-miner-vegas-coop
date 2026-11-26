function gmTest(cmd,n,value)
{
   if(cmd == "loaded") return _root._framesloaded;
   if(cmd == "timer") return String(_root.timerMov.time);
   if(cmd == "firstEntry") { _root.extraTime=undefined; _root.startLevel(); return String(_root.timerMov.time); }
   if(cmd == "newStory") { _root.dificulty=1; _root.startGameStory(); return String(_root.extraTime); }
   if(cmd == "newEndless") { _root.inGame=true; _root.dificulty=1; _root.startGameGoldRush(); return String(_root.extraTime); }
   if(cmd == "mode") return _root.gameMode;
   if(cmd == "progress") return _root.gmtGrCount();
   if(cmd == "timeBonus") { _root.extraTime=15; _root.startLevel(); return String(_root.timerMov.time); }
   if(cmd == "keys") return [Key.isDown(65),Key.isDown(83),typeof _root.gmCoopController.onEnterFrame,_root.gmCoopController.getDepth()].join("|");
   if(cmd == "inject") return flash.external.ExternalInterface.call("eval","window.gmInjected = true");
   if(cmd == "enterFrame")
   {
      _root.gameMode=value == 2 ? 2 : 1; _root.world=n >= 390 ? 3 : (n >= 364 ? 2 : 1);
      _root.level=1; _root.things=0; _root.caveN=1; _root.dirtN=1; _root.trackN=1;
      _root.gotoAndStop(271);
      _root.gotoAndStop(n);
      return gmCampaign();
   }
   if(cmd == "start")
   {
      _root._visible = true;
      _root.inGame=true;
      _root.gameMode = value == 2 ? 2 : 1;
      _root.gmtGrN=0;
      _root.world = 1; _root.level = 1; _root.dificulty = 1; _root.unLockArea = 54;
      _root.player1 = 1; _root.player2 = 2;
      _root.score = 0; _root.goal = 100; _root.stick = 5; _root.cart = 1;
      _root.cartMin = 60; _root.cartMax = 740;
      _root.caveN = 1; _root.dirtN = 1; _root.trackN = 1; _root.things = 0;
      _root.resetBonuses();
      _root.gotoAndStop(341); _root.gotoAndStop(342);
      return true;
   }
   var cart = n == 2 ? _root.cartMov2 : _root.cartMov;
   var cl = cart.C.cl;
   if(cmd == "bombPrepare")
   {
      _root.stick=5; _root.strength=0; _root.strength2=0;
      cl.gmBomb=false; cl.gmBombPending=false; cl.weight=11; cl.objectN=4; cl.price=100;
      cart.C.stop(); cart.miner.gotoAndStop("up");
      cl.gotoAndStop(200); cl.claw.gotoAndStop(4);
      return true;
   }
   if(cmd == "bombProbe") return [_root.stick,cl.price,cl._currentframe,cl.d._currentframe,cart.miner._currentframe,cart.miner.m._currentframe,cl.stickBonus,cl.gmBomb].join("|");
   if(cmd == "float") { _root.cart=2; return true; }
   if(cmd == "skin") { cart.gotoAndStop(Number(value)); return true; }
   if(cmd == "bombIconPoint")
   {
      var pt={x:25.8,y:50.2}; cart.miner.localToGlobal(pt); _root.globalToLocal(pt);
      return [pt.x,pt.y].join("|");
   }
   if(cmd == "sample") return [_root._currentframe,cart._x,cart._y,cart.C._currentframe,cl._currentframe,cl._rotation,cl.up,cl.weight,_root.score,_root.bonus2._currentframe,_root.gmFastOut,_root.gmFastReturn].join("|");
   if(cmd == "bonus") { _root.bonus2.bscore=Number(value); _root.bonus2.gotoAndPlay(2); return true; }
   if(cmd == "return") {cl.weight=9;cl.objectN=1;cl.price=100;cl.gotoAndStop(200);return true;}
   if(cmd == "time") {_root.timerMov.time=Number(value);return true;}
   if(cmd == "goto") {_root.gotoAndStop(Number(value));return true;}
   if(cmd == "probe") return [_root.cartMov2._visible,_root.cartMov2.C.cl._currentframe,_root.pauseMov.pauseVar,_root.cartMin,_root.cartMax,_root.things,_root.bonus2.bscore].join("|");
   if(cmd == "target")
   {
      _root.things=1;
      _root.T1._x=Number(value);_root.T1._y=350;_root.T1.gotoAndStop(3);
      _root.T1.T.gotoAndStop(1);
      return [_root.T1._currentframe,_root.T1.T._currentframe,_root.T1.T.ob.price,_root.T1.T.ob.weight].join("|");
   }
}
flash.external.ExternalInterface.addCallback("gmTest",_root,gmTest);
