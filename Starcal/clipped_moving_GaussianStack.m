function [I2D] = clipped_moving_GaussianStack(pars,X,Y,T,clipint)
% STARINT3 evaluation of a 2D gaussian.
% 
% STARINT3 calculates a 2D gaussian on a matrix located
% between (xmin,xmax) and (ymin,ymax) the maxintensity
% and the spread of the gaussian is given in the array
% PARS.
% 
% Calling:
%  [I2D] = clipped_moving_Gaussian(pars,x,y,t)


%   Copyright © 19970907 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


I0    = pars(1);
x0    = pars(2);
y0    = pars(3);
dr    = pars(4);
ddxdy = pars(5);
phi   = pars(6);
gamma = pars(7);
vx    = pars(8);
vy    = pars(9);
alpha = pars(10);

dx = dr;
dy = dr*ddxdy;

for i_stack = 1:numel(T)
  I2D{i_stack} = 0*X{i_stack};
  for i_t = 1:numel(T{i_stack})
    
    xC = x0 + vx*(T{i_stack}(i_t) - T{1}(1));
    yC = y0 + vy*(T{i_stack}(i_t) - T{1}(1));
    I_peak = I0*exp(alpha*(T{i_stack}(i_t)-T{1}(1)));
  
    I2D{i_stack} = I2D{i_stack} + I_peak*exp(-abs((+cos(phi)*(X{i_stack}-xC)+sin(phi)*(Y{i_stack}-yC)).^2/dx^2 + ...
                                (-sin(phi)*(X{i_stack}-xC)+cos(phi)*(Y{i_stack}-yC)).^2/dy^2 ...
                                ).^(gamma/2) ...
                           );
  end
  I2D{i_stack} = min(I2D{i_stack},clipint);
  
end