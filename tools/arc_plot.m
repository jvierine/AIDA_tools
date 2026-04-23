function ph = arc_plot(theta,r,r0,x0y0,varargin)
% FANPLOT - 
%   


ph = plot(x0y0(1) + cos(theta(1:end)).*(r(:)'+r0),...
     x0y0(2) + sin(theta(1:end)).*(r(:)'+r0),...,...
     varargin{:});
