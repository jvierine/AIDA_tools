function [starintens] = starint(fv,xmin,xmax,ymin,ymax)
% STARINT3 evaluation of a 2D gaussian.
% 
% STARINT3 calculates a 2D gaussian on a matrix located
% between (xmin,xmax) and (ymin,ymax) the maxintensity
% and the spread of the gaussian is given in the array
% FV.
% 
% Calling:
% [starintens] = starint3(fv,xmin,xmax,ymin,ymax)


%   Copyright © 19970907 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

x = xmin:xmax;
y = ymin:ymax;
[x,y] = meshgrid(x,y);

I_peak = fv(3);
x0     = fv(1);
y0     = fv(2);
dx     = fv(4);
phi    = fv(5);
dy     = fv(6);
if ( length(fv) > 6 )
  g = fv(7);
else
  g = 2;
end

starintens = I_peak*exp(-abs((+cos(phi)*(x-x0)+sin(phi)*(y-y0)).^2/dx^2 + ...
                             (-sin(phi)*(x-x0)+cos(phi)*(y-y0)).^2/dy^2).^(g/2));
