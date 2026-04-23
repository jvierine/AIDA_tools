function rOut = curve_mirroring(r_in,r_0,e_l)
% CURVE_MIRRORING - 
%   


plot(r_0(1),r_0(2),'rh')
arrow3(r_0',r_0'+e_l')
e_2 = [e_l(2),-e_l(1)];
arrow3(r_0',r_0'+e_2)

axis auto
Mrot = [[-e_l(2),e_l(1)];e_l(:)'];
r_tmp = Mrot*(r_in - repmat(r_0(:),1,size(r_in,2)));
subplot(2,2,2)
plot(r_tmp(1,:),r_tmp(2,:))
hold on
plot(r_tmp(1,1),r_tmp(2,1),'r.')
pause
r_tmp(1,:) = -r_tmp(1,:);
plot(r_tmp(1,:),r_tmp(2,:))
rOut = Mrot*r_tmp + repmat(r_0(:),1,size(r_in,2));
