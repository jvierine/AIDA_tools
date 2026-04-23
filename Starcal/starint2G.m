function [starintens] = starint2G(fv,x,y)
% STARINT2G evaluation of a 2D Gaussian+gen-Gaussian.
% 
% STARINT3 calculates a 2D gaussian on a matrix located
% between (xmin,xmax) and (ymin,ymax) the maxintensity
% and the spread of the gaussian is given in the array
% FV.
% 
% Calling:
% [starintens] = starint3(fv,x,y)


%   Copyright © 19970907 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later

I_peak = fv(3);
x0     = fv(1);
y0     = fv(2);
dx     = fv(4);
phi    = fv(5);
dy     = fv(6);
if ( numel(fv) > 6)
  g = fv(7);
else
  g = 2;
end

starintens = I_peak*exp(-abs((+cos(phi)*(x-x0)+sin(phi)*(y-y0)).^2/dx^2 + ...
                             (-sin(phi)*(x-x0)+cos(phi)*(y-y0)).^2/dy^2).^(g/2));

% I_peak = fv(3+6);
% x0     = fv(1+6);
% y0     = fv(2+6);
% dx     = fv(4+6);
% phi    = fv(5+6);
% dy     = fv(6+6);
% if ( length(fv) > 6+6 )
%   g = fv(7+6);
% else
%   g = 2;
% end
% starintens = starintens + I_peak*exp(-abs((+cos(phi)*(x-x0)+sin(phi)*(y-y0)).^2/dx^2 + ...
%                                           (-sin(phi)*(x-x0)+cos(phi)*(y-y0)).^2/dy^2).^(g/2));
% 
