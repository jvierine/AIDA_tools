function [SkMp,starpar] = updfindstar(starpar,SkMp)
% UPDFINDSTAR - 
%   

%   Copyright © 2011 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

button = 1;
ginp_clr = [1 0.5 0]; % Colour for cross-hair of ginputc
ginp_lw  = 1;         % linewidth for cross-hair of ginputc

figure( SkMp.figsky )

while ( button == 1 || lower(char(button)) == 'l')
  
  % [x0,y0,button] = ginput(1);
  % [x0,y0] = ginput(1);
  try
    [x0,y0] = ginputc(1,...
                      'color',ginp_clr,...
                      'linewidth',ginp_lw,...
                      'ShowPoints',false);
  catch
    [x0,y0] = ginput(1);
  end
  
  [staraz,starze,starid,starmagn] = findneareststarxy(x0,y0,SkMp);
  title('Retry (l) | Quit (m) | Accept (r)')
  
  % [~,~,button] = ginput(1);
  try
    [~,~,button] = ginputc(1,...
                      'color',ginp_clr,...
                      'linewidth',ginp_lw,...
                      'ShowPoints',false);
  catch
     [~,~,button] = ginput(1);
  end
  
  if ( button == 3 || lower(char(button)) == 'r' )
    
    if ( ~isempty(starpar) && exist('staraz','var') )
      
      i1 = size(SkMp.identstars,1)+1;
      
      SkMp.identstars(i1,1) = staraz;
      SkMp.identstars(i1,2) = starze;
      SkMp.identstars(i1,3) = starpar(1);
      SkMp.identstars(i1,4) = starpar(2);
      
      SkMp.identstars(i1,5) = starpar(3);
      SkMp.identstars(i1,6) = starpar(4);
      SkMp.identstars(i1,7) = starpar(5);
      SkMp.identstars(i1,8) = starpar(6);
      
      SkMp.identstars(i1,9) = starid;
      SkMp.identstars(i1,10) = starmagn;
      
      starpar = [];
      
    elseif ( isempty(starpar) )
      
      information = ['No current star to identify                 ';
		     'Zoom in on a star in FIG 1                  ';
		     'Determine the current starpossition in FIG 4'];
      disp(information)
      
    end
    
  end
  
end
hold off
zoom on
set(gcf,'pointer','arrow')
title('')
try
  delete(SkMp.currStarpoint)
catch
  disp('Oops, shouldn''t get here...')
end
if ~isfield(SkMp,'errorfig')
  
  SkMp = errorgui(SkMp);
  
end
