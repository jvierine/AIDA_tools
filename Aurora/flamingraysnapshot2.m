xG = [150:25:250,256];
[xG,yG] = meshgrid(xG,xG);

%%
subplot(4,1,1)
pcolor([1:20]*1/32,E*1e3,log10(IeRay')),shading flat,caxis([-5 0]+max(caxis))
axIe = axis;
axis([axIe(1:3),5e3])
set(gca,'yscale','log')
hold on
xlabel('time (s)','fontsize',ftsz)
ylabel('Energy (eV)','fontsize',ftsz)
title('Electron spectra','fontsize',ftsz)
set(gca,'ytick',[100 1000 10000])
cbl_h = colorbar_labeled('/eV/m^2/s','log','fontsize',ftsz-2);
set(cbl_h,'position',get(cbl_h,'position')+[-0.01,0,0,0])
%%
for i1 = 11 %:size(ImStack{1},3),
  Iq = ( wiener2(ImStack{1}(:,:,i1),[3,3]) - wiener2(imbg{1}(:,:,i1),[3,3]) ) * 1/C_filter6370;
  stns(1).img = Iq;
  Iq = ( wiener2(ImStack{3}(:,:,i1),[3,3]) - wiener2(imbg{3}(:,:,i1),[3,3]) ) * 1/C_filter7774;
  stns(2).img = Iq;
  res = err4FlamingRays(ITC{1}(i1,:),v_p,I0b,stns,{errMask,errMask},ZfI,XfI(:,:,115),YfI(:,:,115),{A1Z,A2Z},E,2,110);
  ErrR{1}(i1) = res.err;
  subplot(4,1,1)
  %semilogy(E,res.IeOutput{1})
  ph = plot((i1+0.5)/32*[1 1],E([1,end])*1e3,'k');
  subplot(4,2,5)
  imagesc(res.currImg{1}),imgs_smart_caxis(0.0003,res.currImg{1}),axis([150 256 150 256]) 
  hold on
  [~,hC1] = contour(res.currProj{1},7,'w');set(hC1,'linecolor',[1,1,1]*0.99)
  plot(xG,yG,'w:','linewidth',2,'color',[1 1 1]*0.99)
  plot(xG',yG','w:','linewidth',2,'color',[1 1 1]*0.99)
  hold off
  ylabel('Observations','fontsize',ftsz)
  colorbar_labeled('R','linear','fontsize',ftsz-2)
  title('ASK #1 (6730 A)','fontsize',ftsz)
  set(gca,'xticklabel','')
  set(gca,'xtick',[150:25:250])
  set(gca,'ytick',[150:25:250])
  %grid on
  subplot(4,2,6)
  imagesc(res.currImg{2}),imgs_smart_caxis(0.0003,res.currImg{2}),axis([150 256 150 256]) 
  hold on
  [~,hC2] = contour(res.currProj{2},7,'w');set(hC2,'linecolor',[1,1,1]*0.99)
  plot(xG,yG,'w:','linewidth',2,'color',[1 1 1]*0.99)
  plot(xG',yG','w:','linewidth',2,'color',[1 1 1]*0.99)
  hold off
  set(gca,'xtick',[150:25:250])
  set(gca,'ytick',[150:25:250])
  %grid on         
  colorbar_labeled('R','linear','fontsize',ftsz-2)
  title('ASK #3 (7774)','fontsize',ftsz)
  set(gca,'xticklabel','')
  set(gca,'yticklabel','')
  hold off
  set(gca,'xtick',[150:25:250])
  set(gca,'ytick',[150:25:250])
  %grid on
  subplot(4,2,7)
  imagesc(res.currProj{1}),imgs_smart_caxis(0.0003,res.currImg{1}),axis([150 256 150 256])
  ylabel('Modeled','fontsize',ftsz)
  colorbar_labeled('R','linear','fontsize',ftsz-2)
  set(gca,'xtick',[150:25:250])
  set(gca,'ytick',[150:25:250])
  hold on
  plot(xG,yG,'w:','linewidth',2,'color',[1 1 1]*0.99)
  plot(xG',yG','w:','linewidth',2,'color',[1 1 1]*0.99)
  %grid on
  plot3(1:256,256-max(res.currProj{1})/6000*25,ones(256,1),'color',[1,1,1]*0.99)
  plot3(1:256,256-max(res.currImg{1}(150:210,:))/6000*25,ones(256,1),'k')
  hold off
  subplot(4,2,8)
  imagesc(res.currProj{2}),imgs_smart_caxis(0.0003,res.currImg{2}),axis([150 256 150 256])
  hold on
  plot3(1:256,256-max(res.currProj{2})/6000*25,ones(256,1),'color',[1,1,1]*0.99)
  plot3(1:256,260-max(res.currImg{2}(150:210,:))/6000*25,ones(256,1),'k')
  plot(xG,yG,'w:','linewidth',2,'color',[1 1 1]*0.99)
  plot(xG',yG','w:','linewidth',2,'color',[1 1 1]*0.99)
  %grid on
  hold off
  set(gca,'yticklabel','')
  set(gca,'xtick',[150:25:250])
  set(gca,'ytick',[150:25:250])
  colorbar_labeled('R','linear','fontsize',ftsz-2)
  subplot(4,2,3)
  pcolor(XfI(:,:,400),YfI(:,:,400),res.Vem{1}(:,:,400)),shading flat
  xlabel('East of ESR (km)','fontsize',ftsz)
  ylabel('North of ESR (km)','fontsize',ftsz)
  title('Horizontal cut at 180 km (6730)','fontsize',ftsz)
  %axis equal
  [~,i1_i2(1),i1_i2(2)] = max2D(res.Vem{1}(:,:,400));
  subplot(4,2,4)
  plot(squeeze(res.Vem{1}(i1_i2(1),i1_i2(2),:)),squeeze(ZfI(i1_i2(1),i1_i2(2),:)),'r','linewidth',2)
  hold on
  plot(squeeze(res.Vem{2}(i1_i2(1),i1_i2(2),:)),squeeze(ZfI(i1_i2(1),i1_i2(2),:)),'k','linewidth',2)
  axis([0 4e9 50 400])
  ylabel('Altitude (km)','fontsize',ftsz)
  xlabel('(#/m^3/s)','fontsize',ftsz)
  title('Volume emission rate','fontsize',ftsz)
  hold off
  mRay(i1) = getframe(gcf);
  delete(ph)
end
