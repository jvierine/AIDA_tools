function r_out = mirror_point_line(r_in,r0,r1)
% MIRROR_POINT_LINE - mirror point coordinate in arbitrary line
%   mirror_point_line mirrors 2-d points in/on/across line between
%   two arbitrary points
% 
% Calling:
%   r_out = mirror_point_line(r_in,r0,r1)
% input:
%   r_in - points to mirror [nP x 2], double array
%   r0   - point number one on line, two-element double array
%   r1   - point number two on line, two-element double array
% Output:
%   r_out - mirrored points, [nP x 2], double array
% 
% Example:
%  x = linspace(0,2)';
%  y = x.^2;
%  r_in = [x,y];
%  r0 = [0 0];
%  r1 = [1 1];
%  r_out = mirror_point_line(r_in,r0,r1);
%  plot(x,y,'.-')
%  hold on
%  plot([r0(1) r1(1)],[r0(2) r1(2)],'k')
%  plot(r_out(:,1),r_out(:,2),'.-')
%  plot(y,x,'--')
% 
% r0 and r1 should not be the same point
% no argument checking done.


dx = r1(1) - r0(1);
dy = r1(2) - r0(2);

a   = (dx * dx - dy * dy) / (dx * dx + dy*dy);
b   = 2 * dx * dy / (dx*dx + dy*dy);

x2  = (a * (r_in(:,1) - r0(1)) + b*(r_in(:,2) - r0(2)) + r0(1)); 
y2  = (b * (r_in(:,1) - r0(1)) - a*(r_in(:,2) - r0(2)) + r0(2));

r_out = [x2,y2];
