// Campaign controls. Native second-player components keep their own cargo and bonus.
function gmCampaign()
{
   return (_root.gameMode == 1 or _root.gameMode == 2) and _root.gmCampaignFrames[_root._currentframe] == true;
}
function gmSetupCampaignLevel()
{
   if(!gmCampaign())
   {
      _root.cartMov2._visible = false;
      _root.bonus2._visible = false;
      return;
   }
   _root.player2 = 2;
   _root.claw2 = _root.claw;
   _root.minerStrength2 = _root.minerStrength;
   _root.cartMov2._visible = true;
   _root.bonus2._visible = true;
   _root.cartMov2.gotoAndStop(2);
   _root.cartMov.C.gotoAndPlay(1);
   _root.cartMov2.C.gotoAndPlay(1);
   _root.bonus2.gotoAndStop(1);
   var lo = Number(_root.cartMin);
   var hi = Number(_root.cartMax);
   if(isNaN(lo)) lo = 20;
   if(isNaN(hi) or hi <= lo) hi = 780;
   _root.cartMov2._x = lo + (hi-lo)*0.35;
   _root.cartMov._x = lo + (hi-lo)*0.65;
   gmReleaseKeys();
}
function gmShoot(player, x, y, aimed)
{
   if(!gmCampaign() or _root.pauseMov.pauseVar == 1) return false;
   var cart = player == 2 ? _root.cartMov2 : _root.cartMov;
   var arm = cart.C;
   var cl = arm.cl;
   if(cl == undefined or cl._currentframe != 1 or cl.gmPending) return false;
   if(aimed)
   {
      if(isNaN(x) or isNaN(y) or x < 0 or x >= 800 or y < 0 or y >= 600) return false;
      var pt = {x:Number(x),y:Number(y)};
      _root.localToGlobal(pt);
      arm.globalToLocal(pt);
      var dx = pt.x - cl._x;
      var dy = pt.y - cl._y;
      if(dy <= 0) return false;
      arm.stop();
      cl._rotation = Math.atan2(dy,dx)*180/Math.PI-90;
   }
   arm.stop();
   cl.gmPending = true;
   cart.miner.gotoAndStop("down");
   cl.play();
   updateAfterEvent();
   return true;
}
function gmMouseAim(button,x,y)
{
   if(button != 0 and button != 2) return false;
   return gmShoot(button == 0 ? 2 : 1,x,y,_root.gmMouseEnabled);
}
function gmSetModifiers(mouse, outgoing, returning)
{
   _root.gmMouseEnabled = mouse == true;
   _root.gmFastOut = outgoing == true;
   _root.gmFastReturn = returning == true;
   return true;
}
function gmPhysicalKey(code,down)
{
   if(code != 65 and code != 68 and code != 87 and code != 83 and code != 37 and code != 39 and code != 38 and code != 40) return false;
   if(!down) { _root.gmHeld[code] = false; return gmCampaign(); }
   if(!gmCampaign() or _root.pauseMov.pauseVar == 1) return false;
   if(_root.gmHeld[code]) return true;
   _root.gmHeld[code] = true;
   if(code == 65 or code == 68) gmRecall(2);
   if(code == 37 or code == 39) gmRecall(1);
   if(code == 83) gmShoot(2,0,0,false);
   if(code == 40) gmShoot(1,0,0,false);
   if(code == 87) gmDynamite(2);
   if(code == 38) gmDynamite(1);
   return true;
}
function gmRecall(player)
{
   if(!gmCampaign() or _root.pauseMov.pauseVar == 1) return false;
   var cart = player == 2 ? _root.cartMov2 : _root.cartMov;
   var cl = cart.C.cl;
   if(cl == undefined or cl._currentframe < 2 or cl._currentframe > 47) return false;
   var up = Number(cl.up);
   if(isNaN(up)) up = cl._currentframe;
   cart.miner.gotoAndStop("up");
   cl.gotoAndPlay("up" + up);
   updateAfterEvent();
   return true;
}
function gmReleaseKeys()
{
   _root.gmHeld = new Object();
   return true;
}
function gmDynamite(player)
{
   if(!gmCampaign() or _root.pauseMov.pauseVar == 1 or _root.stick < 1) return false;
   var cart = player == 2 ? _root.cartMov2 : _root.cartMov;
   var cl = cart.C.cl;
   if(cl._currentframe < 49 or cl._currentframe >= 370 or cl.gmBomb) return false;
   cl.gmBomb = true;
   cl.gmBombPending = true;
   cl.stop();
   _root.stick--;
   _root.dynMov.prevFrame();
   // Emit the native projectile immediately. The miner's throw animation can
   // disappear when fast return changes its state before the release frame.
   cl.d.gotoAndStop(2);
   cart.miner.m.gotoAndPlay("throw");
   return true;
}
function gmCoopTick()
{
   if(!gmCampaign() or _root.pauseMov.pauseVar == 1) return;
   var carts = [_root.cartMov,_root.cartMov2];
   for(var i=0;i<2;i++)
   {
      var cart = carts[i];
      var cl = cart.C.cl;
      if(cl._currentframe != 1) cl.gmPending = false;
      if(cl._currentframe == 1)
      {
         cl.gmBomb = false;
         cl.gmBombPending = false;
         var left = i == 0 ? 37 : 65;
         var right = i == 0 ? 39 : 68;
         if(_root.gmHeld[left]) cart._x = Math.max(_root.cartMin,cart._x-_root.cartSpeed);
         if(_root.gmHeld[right]) cart._x = Math.min(_root.cartMax,cart._x+_root.cartSpeed);
      }
      if(_root.gmFastOut and cl._currentframe >= 2 and cl._currentframe < 47)
      {
         // Check every intermediate position rather than tunnelling across cargo.
         for(var step=0;step<2 and cl._currentframe < 47 and cl._currentframe >= 2;step++)
         {
            cl.gotoAndPlay(cl._currentframe+1);
            if(i == 0) gmHit1(cl.box); else gmHit2(cl.box);
         }
      }
   }
}
_root.gmMouseEnabled = true;
_root.gmFastOut = false;
_root.gmFastReturn = false;
_root.createEmptyMovieClip("gmCoopController",19990);
_root.gmCoopController.onEnterFrame = gmCoopTick;
gmReleaseKeys();
flash.external.ExternalInterface.addCallback("gmMouseAim",_root,gmMouseAim);
flash.external.ExternalInterface.addCallback("gmSetModifiers",_root,gmSetModifiers);
flash.external.ExternalInterface.addCallback("gmPhysicalKey",_root,gmPhysicalKey);
flash.external.ExternalInterface.addCallback("gmReleaseKeys",_root,gmReleaseKeys);
