function [X,Y,Z,tr] = r0dr_2_XYZ(aurora,r000,dr1,dr2,dr3)
% R0DR_2_XYZ - calculates voxel coordinates (X,Y,Z) 
% from R000 and DR1, DR2, DR3
% 
% Calling:
% [X,Y,Z] = r0dr_2_XYZ(aurora,r000,dr1,dr2,dr3)
%
% ~Same as SC_POSITIONING


%   Copyright © 20050110 Bjorn Gustavsson, <bjorn.gustavsson@irf.se>
%   This is free software, licensed under GNU GPL version 2 or later


Nrvox = size(aurora,1);
Nrvoy = size(aurora,2);
Nrvoz = size(aurora,3);

tr = [dr1',dr2',dr3']^-1;


  
for k3 = Nrvoz:-1:1
  %disp([k/Nrvoy])
  
  for j2 = Nrvoy:-1:1
    
    for i1 = Nrvox:-1:1
      
      r_ = r000 + dr2 * (j2-.5);
      r_ = r_ + dr3 * (k3-.5);
      r_ = r_ + dr1 * (i1-.5);
      
      X(i1,j2,k3) = r_(1);
      Y(i1,j2,k3) = r_(2);
      Z(i1,j2,k3) = r_(3);
      
    end
    
  end
  
end
