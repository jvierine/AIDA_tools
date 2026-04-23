function ph = fanplot(theta,r,r0,x0y0,varargin)
% FANPLOT - 
%   


ph = plot(x0y0(1) + sin(theta([1,1:end,end])).*([0,r(:)'+r0,0]),...
     x0y0(2) + cos(theta([1,1:end,end])).*([0,r(:)'+r0,0]),...,...
     varargin{:});
