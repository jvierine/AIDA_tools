function [mindiff,r_mp] = triangulate_fan4dt(dt,r1,e1,t1,r2,u2,v2,t2,optp2,im2,trmtr2)
% TRIANGULATE_FAN4DT - 
%   


u_C = interp1(t2,u2,t1+dt,'linear','extrap');
v_C = interp1(t2,v2,t1+dt,'linear','extrap');

e2 = inv_project_LineOfSightVectors(u_C,v_C,im2,r2,...
                                    optp2(9),optp2,...
                                    [0 0 1],12,trmtr2);
[r_mp,~,mindiff] = stereoscopic(r1,e1,r2,e2);
