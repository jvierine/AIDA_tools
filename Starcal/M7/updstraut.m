function [SkMp,starpar] = updstraut(SkMp)
% UPDSTRAUT - fit image location size and intensity of star.
%   

%   Copyright © 1997 Bjorn Gustavsson<bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

global bxy bx by

bxy = size(SkMp.img);
bx = bxy(1);
by = bxy(2);

figure( SkMp.figzoom )

% [x0,y0,button] = ginput(1);
[x0,y0] = ginput(1);
dl = SkMp.prefs.sz_z_r;

x0 = floor(x0);
y0 = floor(y0);

xmin = floor(min(max(x0-dl/2,1),by-dl));
xmax = floor(max(min(x0+dl/2,by),dl+1));
ymin = floor(min(max(y0-dl/2,1),bx-dl));
ymax = floor(max(min(y0+dl/2,bx),dl+1));
[xStar,yStar] = meshgrid(xmin:xmax,ymin:ymax);

set(SkMp.figzoom,'pointer','watch')
starmat = SkMp.img(ymin:ymax,xmin:xmax);
back_gr = median( [starmat(1,:) starmat(end,:)  starmat(:,end)' starmat(:,1)' ]);
starmat = starmat - back_gr;
startvec = [x0,y0,SkMp.img(y0,x0),1,0,1];

fmsOPS = optimset('fminsearch');
fmsOPS.Display = 'off';

starpar = fminsearch(@(startvec) stardiff2(startvec,xStar,yStar,starmat,x0,y0,0),startvec,fmsOPS);

set(SkMp.figzoom,'pointer','arrow')

fynd = starint(starpar,xmin,xmax,ymin,ymax);

hold off
if ( max(max(starmat)) - min(min(starmat)) > eps )
  
  contour(xmin:xmax,ymin:ymax,starmat,8,'b')
  
end
hold on
if ( max(max(fynd)) - min(min(fynd)) > eps )
  
  contour(xmin:xmax,ymin:ymax,fynd,8,'r')
  
end
hold off
if ( starpar(1) < xmin || starpar(1) > xmax || ...
     starpar(2) < ymin || starpar(2) > ymax )
  % Then the 2-D Gaussian fit has gone wrong and we should not push
  % further, so lets set starpar to empty
  starpar = [];
  disp('Warning: 2-D Gaussian star-fit has gone wrong.')
end
SkMp.starpar = starpar;
