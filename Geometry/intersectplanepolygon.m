function is_intersecting = intersectplanepolygon(r0,e_line,r3Dvertices)
% INTESECTPLANEPOLYGON - 
%   
% Example:
% % 5 points in a plane
% r5 = [-.5 -1 0;.5 -1 0;1 0 0;0 1 0;-1 0 0]';
% r5(3,:) = 1;                                
% Mrot = @(az,ze) [cos(az) -sin(az) 0;sin(az) cos(az) 0;0 0 1]*...
%                 [cos(ze) 0 -sin(ze);0 1 0;sin(ze) 0 cos(ze)];
% r5 = Mrot(20*pi/180,10*pi/180)*r5;
% r0 = [0 0 -1]';
% e_line = [0 0 1]';
% e_line = Mrot(20*pi/180,10*pi/180)'*e_line;
% is_intersecting = intersectplanepolygon(r0,e_line,r5)

plot3(r3Dvertices(1,[1:end,1]),r3Dvertices(2,[1:end,1]),r3Dvertices(3,[1:end,1]),'r','linewidth',2)
hold on
plot3(0,0,0,'k.','markersize',15)
axis([-1 1 -1 1 -1 1]*1.5)
grid on
% normal vector of plane
norm_vec = cross(r3Dvertices(:,2)-r3Dvertices(:,1),...
                 r3Dvertices(:,end)-r3Dvertices(:,1));
e_n = norm_vec/norm(norm_vec)
% normal-distance to plane from origin
l2plane = dot(r3Dvertices(:,1),e_n)
arrow3([0 0 0],l2plane*e_n')

% 2 perpendicular unit-vectors in plane
e_1 = (r3Dvertices(:,2) - r3Dvertices(:,1))/norm(r3Dvertices(:,2) - r3Dvertices(:,1))
e_2 = cross(e_n,e_1)
arrow3(r3Dvertices(:,1)',r3Dvertices(:,1)' + 1*e_1','r')
arrow3(r3Dvertices(:,1)',r3Dvertices(:,1)' + 1*e_2','g')
arrow3(r3Dvertices(:,1)',r3Dvertices(:,1)' + 1*e_n','b');
% rotation-matrix
M = [e_1';e_2';e_n']


% Transformed coordinates of plane in e_1, e_2 directions with
% origin at r3Dvertices(:,1)
r_new= M*(r3Dvertices - repmat(r3Dvertices(:,1),1,size(r3Dvertices,2)));

% Point of line intersection of plane
l2p = (l2plane - dot(r0,e_n))/(dot(e_line, e_n))
r_intersectplane = r0 + (l2plane - dot(r0,e_n))/(dot(e_line, e_n))*e_line
plot3(r_intersectplane(1),r_intersectplane(2),r_intersectplane(3),'m.','markersize',12)
hold on
plot3(r0(1),r0(2),r0(3),'b.','markersize',15)
arrow3(r0(:)',r0' + l2p*e_line','a')

r_ipnew = M*(r_intersectplane - r3Dvertices(:,1));

is_intersecting = inpolygon(r_ipnew(1),r_ipnew(2),r_new(1,:),r_new(2,:));